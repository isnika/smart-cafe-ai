from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

DATA_PATH = Path(__file__).resolve().parents[1] / "recommendation" / "data_mock" / "orders.csv"


class RevenueForecastService:
    """Daily revenue prediction using historical order totals and calendar/lag features."""

    def __init__(self, data_path: Path | None = None):
        self.data_path = data_path or DATA_PATH
        self.model: RandomForestRegressor | None = None
        self.history: pd.Series | None = None
        self.mae: float | None = None
        self._fit()

    def _fit(self):
        if not self.data_path.exists():
            raise FileNotFoundError(f"Không tìm thấy dữ liệu orders.csv: {self.data_path}")
        orders = pd.read_csv(self.data_path)
        required = {"order_time", "order_total_vnd"}
        if not required.issubset(orders.columns):
            raise ValueError(f"orders.csv cần các cột: {sorted(required)}")
        orders["order_time"] = pd.to_datetime(orders["order_time"], errors="coerce")
        orders["order_total_vnd"] = pd.to_numeric(orders["order_total_vnd"], errors="coerce")
        orders = orders.dropna(subset=["order_time", "order_total_vnd"])
        orders = orders[orders["order_total_vnd"] >= 0]
        if orders.empty:
            raise ValueError("Không có dữ liệu doanh thu hợp lệ trong orders.csv")
        daily = orders.set_index("order_time")["order_total_vnd"].resample("D").sum().asfreq("D", fill_value=0)
        if len(daily) < 21:
            raise ValueError("Cần ít nhất 21 ngày dữ liệu để dự đoán doanh thu.")
        self.history = daily.astype(float)
        frame = self._training_frame(self.history)
        feature_cols = self._feature_columns()
        split = max(int(len(frame) * 0.8), 1)
        train = frame.iloc[:split]
        test = frame.iloc[split:]
        self.model = RandomForestRegressor(
            n_estimators=250, max_depth=10, min_samples_leaf=2,
            random_state=42, n_jobs=-1,
        )
        self.model.fit(train[feature_cols], train["target"])
        if not test.empty:
            predicted = self.model.predict(test[feature_cols])
            self.mae = float(mean_absolute_error(test["target"], predicted))
        # Refit on all observed data after retaining a time-based holdout metric.
        self.model.fit(frame[feature_cols], frame["target"])

    @staticmethod
    def _feature_columns():
        return ["day_of_week", "day_of_month", "month", "day_of_year", "is_weekend", "lag_1", "lag_7", "rolling_mean_7"]

    @classmethod
    def _training_frame(cls, series: pd.Series) -> pd.DataFrame:
        frame = pd.DataFrame({"target": series})
        idx = frame.index
        frame["day_of_week"] = idx.dayofweek
        frame["day_of_month"] = idx.day
        frame["month"] = idx.month
        frame["day_of_year"] = idx.dayofyear
        frame["is_weekend"] = (idx.dayofweek >= 5).astype(int)
        frame["lag_1"] = frame["target"].shift(1)
        frame["lag_7"] = frame["target"].shift(7)
        frame["rolling_mean_7"] = frame["target"].shift(1).rolling(7).mean()
        return frame.dropna()

    def forecast(self, start_date: str, days: int = 7) -> dict:
        if not 1 <= days <= 90:
            raise ValueError("days phải nằm trong khoảng 1 đến 90")
        try:
            requested_start = pd.Timestamp(start_date).normalize()
        except Exception as exc:
            raise ValueError("start_date phải có định dạng YYYY-MM-DD") from exc
        if self.history is None or self.model is None:
            raise RuntimeError("Forecast model chưa được khởi tạo")
        history = self.history.copy()
        last_date = history.index[-1].normalize()
        if requested_start <= last_date:
            # Avoid using actual values from after requested_start to make a future forecast.
            history = history.loc[:requested_start - pd.Timedelta(days=1)]
            if len(history) < 14:
                raise ValueError("Không đủ lịch sử trước start_date để dự đoán.")
        # Fill the gap between last observed date and requested start recursively.
        final_date = requested_start + pd.Timedelta(days=days - 1)
        future_rows = []
        next_date = history.index[-1] + pd.Timedelta(days=1)
        while next_date <= final_date:
            if len(history) < 7:
                raise ValueError("Không đủ dữ liệu lịch sử để tạo lag features.")
            row = {
                "day_of_week": next_date.dayofweek,
                "day_of_month": next_date.day,
                "month": next_date.month,
                "day_of_year": next_date.dayofyear,
                "is_weekend": int(next_date.dayofweek >= 5),
                "lag_1": float(history.iloc[-1]),
                "lag_7": float(history.iloc[-7]),
                "rolling_mean_7": float(history.iloc[-7:].mean()),
            }
            prediction = max(0.0, float(self.model.predict(pd.DataFrame([row])[self._feature_columns()])[0]))
            history.loc[next_date] = prediction
            if next_date >= requested_start:
                future_rows.append({"date": next_date.strftime("%Y-%m-%d"), "predicted_revenue": round(prediction, 0)})
            next_date += pd.Timedelta(days=1)
        return {
            "start_date": requested_start.strftime("%Y-%m-%d"),
            "days": days,
            "currency": "VND",
            "model": "RandomForestRegressor",
            "validation_mae_vnd": round(self.mae, 0) if self.mae is not None else None,
            "forecast": future_rows,
        }


@lru_cache(maxsize=1)
def get_forecast_service() -> RevenueForecastService:
    return RevenueForecastService()
