"""Feature engineering for daily café revenue forecasting."""
import pandas as pd

FEATURE_COLUMNS = [
    "day_of_week", "day_of_month", "month", "day_of_year", "is_weekend",
    "lag_1", "lag_7", "lag_14", "rolling_mean_7", "rolling_mean_28",
]

def make_training_frame(series: pd.Series) -> pd.DataFrame:
    """Build supervised features without using future observations."""
    series = series.sort_index().astype(float)
    idx = series.index
    frame = pd.DataFrame({"target": series}, index=idx)
    frame["day_of_week"] = idx.dayofweek
    frame["day_of_month"] = idx.day
    frame["month"] = idx.month
    frame["day_of_year"] = idx.dayofyear
    frame["is_weekend"] = (idx.dayofweek >= 5).astype(int)
    frame["lag_1"] = frame["target"].shift(1)
    frame["lag_7"] = frame["target"].shift(7)
    frame["lag_14"] = frame["target"].shift(14)
    frame["rolling_mean_7"] = frame["target"].shift(1).rolling(7).mean()
    frame["rolling_mean_28"] = frame["target"].shift(1).rolling(28).mean()
    return frame.dropna()

def make_future_features(target_date, history: pd.Series) -> pd.DataFrame:
    """Create one prediction row using only data available before target_date."""
    if len(history) < 28:
        raise ValueError("Cần tối thiểu 28 ngày lịch sử trước ngày dự báo.")
    d = pd.Timestamp(target_date)
    return pd.DataFrame([{
        "day_of_week": d.dayofweek, "day_of_month": d.day, "month": d.month,
        "day_of_year": d.dayofyear, "is_weekend": int(d.dayofweek >= 5),
        "lag_1": float(history.iloc[-1]), "lag_7": float(history.iloc[-7]),
        "lag_14": float(history.iloc[-14]),
        "rolling_mean_7": float(history.iloc[-7:].mean()),
        "rolling_mean_28": float(history.iloc[-28:].mean()),
    }], columns=FEATURE_COLUMNS)
