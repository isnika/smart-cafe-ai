"""Offline recommendation models used by the training pipeline.

The serving path intentionally keeps the existing recommendation service as a
fallback.  These models expose only deterministic score dictionaries so the
training/evaluation code and the API artifact loader can share one contract.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from src.app.recommendation.features.features import (
    create_tfidf_features,
    create_user_item_matrix,
)


def _history(interactions: pd.DataFrame, user_id: str) -> pd.DataFrame:
    if interactions.empty:
        return interactions.copy()
    return interactions[interactions["user_id"].astype(str) == str(user_id)].copy()


def preference_weights(
    interactions: pd.DataFrame,
    user_id: str,
    as_of: pd.Timestamp,
    recency_half_life_days: int = 60,
    max_quantity_signal: int = 8,
    max_order_signal: int = 20,
) -> dict[int, float]:
    rows = _history(interactions, user_id)
    if rows.empty:
        return {}
    last_purchase = pd.to_datetime(rows["last_purchase"], errors="coerce")
    age_days = (
        as_of - last_purchase
    ).dt.total_seconds().div(86400).fillna(365).clip(lower=0)
    recency = (0.5 ** (age_days / max(1, recency_half_life_days))).clip(lower=0.05)
    quantity = rows["quantity"].clip(lower=0, upper=max(1, max_quantity_signal))
    n_orders = rows["n_orders"].clip(lower=0, upper=max(1, max_order_signal))
    strength = quantity.map(lambda value: math.log1p(float(value)))
    strength += 0.7 * n_orders.map(lambda value: math.log1p(float(value)))
    rating_factor = pd.Series(1.0, index=rows.index)
    ratings = rows["rating"]
    rating_factor.loc[ratings.notna() & (ratings >= 4)] = 1.25
    rating_factor.loc[ratings.notna() & (ratings <= 2)] = 0.55
    values = (strength + 0.1) * recency * rating_factor
    return {
        int(product_id): float(weight)
        for product_id, weight in zip(rows["product_id"], values, strict=True)
    }


def normalize_scores(scores: dict[int, float]) -> dict[int, float]:
    """Map a model's raw scores to a stable non-negative ranking score."""

    if not scores:
        return {}
    values = np.asarray(list(scores.values()), dtype=float)
    finite = np.isfinite(values)
    if not finite.any():
        return {}
    low = float(np.nanmin(values[finite]))
    high = float(np.nanmax(values[finite]))
    if high <= low:
        return {int(product_id): 1.0 for product_id in scores}
    return {
        int(product_id): max(0.0, (float(score) - low) / (high - low))
        for product_id, score in scores.items()
        if math.isfinite(float(score))
    }


@dataclass
class PopularityModel:
    item_ids: list[int]
    scores: dict[int, float]
    window_days: int = 30

    @classmethod
    def fit(
        cls,
        products: pd.DataFrame,
        interactions: pd.DataFrame,
        as_of: pd.Timestamp,
        window_days: int = 30,
    ) -> "PopularityModel":
        item_ids = products["product_id"].astype(int).tolist()
        if interactions.empty:
            return cls(item_ids, {})
        dates = pd.to_datetime(interactions["last_purchase"], errors="coerce")
        recent = interactions[dates >= as_of - pd.Timedelta(days=window_days)]
        source = recent if not recent.empty else interactions
        scores = source.groupby("product_id")["quantity"].sum().to_dict()
        return cls(item_ids, {int(key): float(value) for key, value in scores.items()}, window_days)

    def score_user(self, user_id: str, history: pd.DataFrame | None = None) -> dict[int, float]:
        del user_id, history
        return {item_id: self.scores.get(item_id, 0.0) for item_id in self.item_ids}


@dataclass
class ContentModel:
    item_ids: list[int]
    vectorizer: object
    tfidf_matrix: object
    similarity: np.ndarray
    item_index: dict[int, int]
    recency_half_life_days: int = 60

    @classmethod
    def fit(
        cls,
        products: pd.DataFrame,
        recency_half_life_days: int = 60,
    ) -> "ContentModel":
        matrix, vectorizer = create_tfidf_features(products)
        item_ids = products["product_id"].astype(int).tolist()
        return cls(
            item_ids=item_ids,
            vectorizer=vectorizer,
            tfidf_matrix=matrix,
            similarity=cosine_similarity(matrix),
            item_index={item_id: index for index, item_id in enumerate(item_ids)},
            recency_half_life_days=recency_half_life_days,
        )

    def score_user(
        self,
        user_id: str,
        interactions: pd.DataFrame,
        as_of: pd.Timestamp,
    ) -> dict[int, float]:
        scores: dict[int, float] = {}
        weights = preference_weights(
            interactions,
            user_id,
            as_of,
            recency_half_life_days=self.recency_half_life_days,
        )
        for source_id, weight in weights.items():
            source_index = self.item_index.get(source_id)
            if source_index is None:
                continue
            for index, candidate_id in enumerate(self.item_ids):
                if candidate_id == source_id:
                    continue
                similarity = float(self.similarity[source_index, index])
                if similarity > 0:
                    scores[candidate_id] = scores.get(candidate_id, 0.0) + similarity * weight
        return scores


@dataclass
class ItemItemModel:
    item_ids: list[int]
    similarity: np.ndarray | None
    item_index: dict[int, int]
    recency_half_life_days: int = 60

    @classmethod
    def fit(
        cls,
        products: pd.DataFrame,
        interactions: pd.DataFrame,
        recency_half_life_days: int = 60,
    ) -> "ItemItemModel":
        item_ids = products["product_id"].astype(int).tolist()
        if interactions.empty:
            return cls(item_ids, None, {item_id: index for index, item_id in enumerate(item_ids)})
        matrix = create_user_item_matrix(interactions)
        observed_ids = [int(value) for value in matrix.columns]
        similarity = cosine_similarity(matrix.T)
        return cls(
            item_ids=observed_ids,
            similarity=similarity,
            item_index={item_id: index for index, item_id in enumerate(observed_ids)},
            recency_half_life_days=recency_half_life_days,
        )

    def score_user(
        self,
        user_id: str,
        interactions: pd.DataFrame,
        as_of: pd.Timestamp,
    ) -> dict[int, float]:
        if self.similarity is None:
            return {}
        weights = preference_weights(
            interactions,
            user_id,
            as_of,
            recency_half_life_days=self.recency_half_life_days,
        )
        if len(weights) < 3:
            return {}
        purchased = set(weights)
        scores: dict[int, float] = {}
        for source_id, weight in weights.items():
            source_index = self.item_index.get(source_id)
            if source_index is None:
                continue
            for index, similarity in enumerate(self.similarity[source_index]):
                candidate_id = self.item_ids[index]
                if candidate_id in purchased or similarity <= 0:
                    continue
                scores[candidate_id] = scores.get(candidate_id, 0.0) + float(similarity) * weight
        return scores


@dataclass
class ImplicitALSModel:
    user_ids: list[str]
    item_ids: list[int]
    user_index: dict[str, int]
    item_index: dict[int, int]
    user_factors: np.ndarray
    item_factors: np.ndarray
    factors: int
    regularization: float
    alpha: float
    iterations: int

    @classmethod
    def fit(
        cls,
        products: pd.DataFrame,
        interactions: pd.DataFrame,
        factors: int = 24,
        regularization: float = 0.1,
        alpha: float = 12.0,
        iterations: int = 12,
        random_state: int = 42,
    ) -> "ImplicitALSModel":
        user_ids = sorted(interactions["user_id"].astype(str).unique().tolist())
        item_ids = products["product_id"].astype(int).tolist()
        user_index = {user_id: index for index, user_id in enumerate(user_ids)}
        item_index = {item_id: index for index, item_id in enumerate(item_ids)}
        rows = np.zeros((len(user_ids), len(item_ids)), dtype=float)
        if not interactions.empty:
            for row in interactions.itertuples(index=False):
                user_pos = user_index.get(str(row.user_id))
                item_pos = item_index.get(int(row.product_id))
                if user_pos is not None and item_pos is not None:
                    rows[user_pos, item_pos] = math.log1p(float(row.quantity)) + 0.7 * math.log1p(float(row.n_orders))

        rng = np.random.default_rng(random_state)
        user_factors = rng.normal(0, 0.1, size=(len(user_ids), factors))
        item_factors = rng.normal(0, 0.1, size=(len(item_ids), factors))
        identity = np.eye(factors)
        for _ in range(max(1, iterations)):
            item_gram = item_factors.T @ item_factors
            for user_pos in range(len(user_ids)):
                confidence_delta = alpha * rows[user_pos]
                system = item_gram + item_factors.T @ (confidence_delta[:, None] * item_factors)
                system += regularization * identity
                target = item_factors.T @ ((1.0 + confidence_delta) * (rows[user_pos] > 0))
                user_factors[user_pos] = np.linalg.solve(system, target)

            user_gram = user_factors.T @ user_factors
            for item_pos in range(len(item_ids)):
                confidence_delta = alpha * rows[:, item_pos]
                system = user_gram + user_factors.T @ (confidence_delta[:, None] * user_factors)
                system += regularization * identity
                target = user_factors.T @ ((1.0 + confidence_delta) * (rows[:, item_pos] > 0))
                item_factors[item_pos] = np.linalg.solve(system, target)
        return cls(
            user_ids,
            item_ids,
            user_index,
            item_index,
            user_factors,
            item_factors,
            factors,
            regularization,
            alpha,
            iterations,
        )

    def score_user(self, user_id: str) -> dict[int, float]:
        user_pos = self.user_index.get(str(user_id))
        if user_pos is None:
            return {}
        scores = self.user_factors[user_pos] @ self.item_factors.T
        return {item_id: float(scores[index]) for index, item_id in enumerate(self.item_ids)}


@dataclass
class BPRModel:
    user_ids: list[str]
    item_ids: list[int]
    user_index: dict[str, int]
    item_index: dict[int, int]
    user_factors: np.ndarray
    item_factors: np.ndarray
    factors: int
    regularization: float
    learning_rate: float
    epochs: int

    @classmethod
    def fit(
        cls,
        products: pd.DataFrame,
        interactions: pd.DataFrame,
        factors: int = 24,
        regularization: float = 0.01,
        learning_rate: float = 0.03,
        epochs: int = 20,
        random_state: int = 42,
    ) -> "BPRModel":
        user_ids = sorted(interactions["user_id"].astype(str).unique().tolist())
        item_ids = products["product_id"].astype(int).tolist()
        user_index = {user_id: index for index, user_id in enumerate(user_ids)}
        item_index = {item_id: index for index, item_id in enumerate(item_ids)}
        positives: dict[int, set[int]] = {index: set() for index in range(len(user_ids))}
        for row in interactions.itertuples(index=False):
            user_pos = user_index.get(str(row.user_id))
            item_pos = item_index.get(int(row.product_id))
            if user_pos is not None and item_pos is not None:
                positives[user_pos].add(item_pos)

        rng = np.random.default_rng(random_state)
        user_factors = rng.normal(0, 0.1, size=(len(user_ids), factors))
        item_factors = rng.normal(0, 0.1, size=(len(item_ids), factors))
        active_users = [user_pos for user_pos, values in positives.items() if values]
        samples_per_epoch = max(1, min(50_000, sum(len(values) for values in positives.values()) * 2))
        for _ in range(max(1, epochs)):
            for _ in range(samples_per_epoch):
                user_pos = int(rng.choice(active_users))
                if len(positives[user_pos]) >= len(item_ids):
                    continue
                positive_pos = int(rng.choice(tuple(positives[user_pos])))
                negative_pos = int(rng.integers(0, len(item_ids)))
                while negative_pos in positives[user_pos] and len(positives[user_pos]) < len(item_ids):
                    negative_pos = int(rng.integers(0, len(item_ids)))
                user_vector = user_factors[user_pos].copy()
                positive_vector = item_factors[positive_pos].copy()
                negative_vector = item_factors[negative_pos].copy()
                margin = float(user_vector @ (positive_vector - negative_vector))
                sigmoid_negative = 1.0 / (1.0 + math.exp(min(60.0, max(-60.0, margin))))
                user_factors[user_pos] += learning_rate * (
                    sigmoid_negative * (positive_vector - negative_vector) - regularization * user_vector
                )
                item_factors[positive_pos] += learning_rate * (
                    sigmoid_negative * user_vector - regularization * positive_vector
                )
                item_factors[negative_pos] += learning_rate * (
                    -sigmoid_negative * user_vector - regularization * negative_vector
                )
        return cls(
            user_ids,
            item_ids,
            user_index,
            item_index,
            user_factors,
            item_factors,
            factors,
            regularization,
            learning_rate,
            epochs,
        )

    def score_user(self, user_id: str) -> dict[int, float]:
        user_pos = self.user_index.get(str(user_id))
        if user_pos is None:
            return {}
        scores = self.user_factors[user_pos] @ self.item_factors.T
        return {item_id: float(scores[index]) for index, item_id in enumerate(self.item_ids)}

