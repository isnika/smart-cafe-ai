"""Baseline and tree-model factories used by forecasting."""

from __future__ import annotations

import numpy as np
import pandas as pd

from sklearn.ensemble import HistGradientBoostingRegressor

def build_hist_gradient_boosting():
    return HistGradientBoostingRegressor(
        max_iter=250, learning_rate=0.06, max_leaf_nodes=15,
        l2_regularization=2.0, random_state=42,
    )


def seasonal_naive(history: pd.Series, target_date: pd.Timestamp) -> float:
    """Use the value from the same weekday one week earlier."""

    if len(history) < 7:
        return float(history.mean()) if len(history) else 0.0
    return float(history.iloc[-7])


def weekday_mean(history: pd.Series, target_date: pd.Timestamp, window_days: int = 56) -> float:
    """Mean of observed/predicted days with the target weekday in a recent window."""

    recent = history.tail(window_days)
    values = recent[recent.index.dayofweek == pd.Timestamp(target_date).dayofweek]
    if len(values) < 4:
        values = recent
    return float(values.mean()) if len(values) else 0.0


def safe_non_negative(value: float) -> float:
    value = float(value)
    return max(0.0, value) if np.isfinite(value) else 0.0
