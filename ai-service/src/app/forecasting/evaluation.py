from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error

from .features import FEATURE_COLUMNS, make_future_features, make_training_frame
from .models import (
    build_extra_trees,
    build_hist_gradient_boosting,
    build_random_forest,
    seasonal_naive,
    weekday_mean,
)


TREE_FACTORIES: dict[str, Callable] = {
    "RandomForestRegressor": build_random_forest,
    "ExtraTreesRegressor": build_extra_trees,
    "HistGradientBoostingRegressor": build_hist_gradient_boosting,
}
BASELINE_NAMES = ("SeasonalNaive", "WeekdayMean8Weeks")
CANDIDATE_NAMES = (*BASELINE_NAMES, *TREE_FACTORIES.keys())


def _metrics(actual: pd.Series, predicted: list[float]) -> dict[str, float | None]:
    y_true = np.asarray(actual, dtype=float)
    y_pred = np.asarray(predicted, dtype=float)
    y_pred = np.where(np.isfinite(y_pred), np.maximum(0.0, y_pred), 0.0)
    denominator = float(np.abs(y_true).sum())
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "wape": float(np.abs(y_true - y_pred).sum() / denominator)
        if denominator > 0
        else None,
    }


def fit_tree_model(model_name: str, history: pd.Series):
    if model_name not in TREE_FACTORIES:
        return None
    frame = make_training_frame(history)
    if frame.empty or len(frame) < 10:
        raise ValueError("Không đủ dữ liệu sau khi tạo lag/rolling features.")
    model = TREE_FACTORIES[model_name]()
    model.fit(frame[FEATURE_COLUMNS], frame["target"])
    return model


def recursive_predict(
    model_name: str,
    model,
    history: pd.Series,
    start_date: pd.Timestamp,
    horizon: int,
) -> list[float]:
    working = history.copy().sort_index().astype(float)
    predictions: list[float] = []
    next_date = pd.Timestamp(start_date).normalize()
    for _ in range(horizon):
        if model_name == "SeasonalNaive":
            value = seasonal_naive(working, next_date)
        elif model_name == "WeekdayMean8Weeks":
            value = weekday_mean(working, next_date)
        else:
            row = make_future_features(next_date, working)
            value = float(model.predict(row[FEATURE_COLUMNS])[0])
        value = float(value) if np.isfinite(value) else 0.0
        value = max(0.0, value)
        working.loc[next_date] = value
        predictions.append(value)
        next_date += pd.Timedelta(days=1)
    return predictions


def _aggregate(folds: list[dict], model_name: str) -> dict[str, float | None]:
    actual: list[float] = []
    predicted: list[float] = []
    for fold in folds:
        result = fold["models"][model_name]
        actual.extend(result["actual"])
        predicted.extend(result["predicted"])
    if not actual:
        return {"mae": None, "rmse": None, "wape": None}
    return _metrics(pd.Series(actual), predicted)


def rolling_origin_evaluation(
    series: pd.Series,
    *,
    initial_train_days: int = 365,
    horizon_days: int = 7,
    step_days: int = 28,
    max_folds: int = 5,
) -> dict:
    """Evaluate the production-style recursive forecast without shuffling.

    The last selected fold is kept as an untouched test fold. Model selection
    uses only the preceding rolling-origin validation folds.
    """

    series = series.sort_index().astype(float)
    series = series.replace([np.inf, -np.inf], np.nan).dropna()
    if len(series) < max(45, horizon_days + 30):
        return {
            "selected_model": "WeekdayMean8Weeks",
            "candidate_names": list(CANDIDATE_NAMES),
            "folds": [],
            "validation": {},
            "test": {},
            "fallback_reason": "insufficient_history_for_rolling_evaluation",
        }
    initial = min(max(30, int(initial_train_days)), len(series) - horizon_days)
    origins = list(range(initial, len(series) - horizon_days + 1, max(1, step_days)))
    if not origins or origins[-1] != len(series) - horizon_days:
        origins.append(len(series) - horizon_days)
    origins = sorted(set(origins))[-max(2, int(max_folds)) :]
    folds: list[dict] = []
    for fold_number, origin in enumerate(origins, start=1):
        train = series.iloc[:origin]
        test = series.iloc[origin : origin + horizon_days]
        fold_models: dict[str, dict] = {}
        for model_name in CANDIDATE_NAMES:
            model = fit_tree_model(model_name, train) if model_name in TREE_FACTORIES else None
            predicted = recursive_predict(
                model_name, model, train, test.index[0], len(test)
            )
            fold_models[model_name] = {
                "actual": [float(value) for value in test],
                "predicted": predicted,
                "metrics": _metrics(test, predicted),
            }
        folds.append(
            {
                "fold": fold_number,
                "cutoff": train.index[-1].strftime("%Y-%m-%d"),
                "test_start": test.index[0].strftime("%Y-%m-%d"),
                "test_end": test.index[-1].strftime("%Y-%m-%d"),
                "train_days": len(train),
                "test_days": len(test),
                "models": fold_models,
            }
        )

    validation_folds = folds[:-1]
    test_folds = folds[-1:]
    validation = {
        model_name: _aggregate(validation_folds, model_name)
        for model_name in CANDIDATE_NAMES
    }
    test = {model_name: _aggregate(test_folds, model_name) for model_name in CANDIDATE_NAMES}
    eligible = {
        name: scores["mae"]
        for name, scores in validation.items()
        if scores["mae"] is not None
    }
    selected_model = min(eligible, key=eligible.get) if eligible else "WeekdayMean8Weeks"
    return {
        "selected_model": selected_model,
        "candidate_names": list(CANDIDATE_NAMES),
        "folds": [
            {key: value for key, value in fold.items() if key != "models"}
            for fold in folds
        ],
        "validation": validation,
        "test": test,
        "fallback_reason": None,
    }
