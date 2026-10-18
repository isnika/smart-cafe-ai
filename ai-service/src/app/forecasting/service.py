from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

DATA_DIR = Path(__file__).resolve().parent / "data_mock"
DATA_PATH = DATA_DIR / "orders.csv"
ITEMS_PATH = DATA_DIR / "order_items.csv"
INVENTORY_PATH = DATA_DIR / "inventory.csv"
RECIPES_PATH = DATA_DIR / "recipes.csv"


class RevenueForecastService:
    """Forecast daily revenue with chronological validation and recursive lag features."""

    def __init__(self, data_path: Path | None = None):
        self.data_path = data_path or DATA_PATH
        self.history: pd.Series | None = None
        self.model = None
        self.model_name = ""
        self.mae: float | None = None
        self._fit()

    @staticmethod
    def _feature_columns():
        return ["day_of_week", "day_of_month", "month", "day_of_year",
                "is_weekend", "lag_1", "lag_7", "lag_14", "rolling_mean_7", "rolling_mean_28"]

    @classmethod
    def _training_frame(cls, series: pd.Series) -> pd.DataFrame:
        idx = series.index
        frame = pd.DataFrame({"target": series.astype(float)}, index=idx)
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

    def _fit(self):
        if not self.data_path.exists():
            raise FileNotFoundError(f"Không tìm thấy dữ liệu forecasting: {self.data_path}")
        orders = pd.read_csv(self.data_path)
        required = {"order_time", "order_total_vnd"}
        if not required.issubset(orders.columns):
            raise ValueError(f"orders.csv cần các cột: {sorted(required)}")
        orders["order_time"] = pd.to_datetime(orders["order_time"], errors="coerce")
        orders["order_total_vnd"] = pd.to_numeric(orders["order_total_vnd"], errors="coerce")
        if "order_status" in orders.columns:
            orders = orders[orders["order_status"].eq("Completed")]
        if "payment_status" in orders.columns:
            orders = orders[orders["payment_status"].eq("Paid")]
        orders = orders.dropna(subset=["order_time", "order_total_vnd"])
        orders = orders[orders["order_total_vnd"] >= 0]
        if orders.empty:
            raise ValueError("Không có doanh thu hợp lệ trong orders.csv")
        daily = orders.set_index("order_time")["order_total_vnd"].resample("D").sum().asfreq("D", fill_value=0)
        if len(daily) < 45:
            raise ValueError("Cần ít nhất 45 ngày dữ liệu để dự đoán ổn định.")
        self.history = daily.astype(float)
        frame = self._training_frame(self.history)
        cols = self._feature_columns()
        split = max(int(len(frame) * 0.8), 1)
        train, test = frame.iloc[:split], frame.iloc[split:]
        candidates = {
            "RandomForestRegressor": RandomForestRegressor(n_estimators=350, max_depth=12, min_samples_leaf=2, max_features=0.9, random_state=42, n_jobs=-1),
            "ExtraTreesRegressor": ExtraTreesRegressor(n_estimators=350, max_depth=14, min_samples_leaf=2, max_features=0.9, random_state=42, n_jobs=-1),
            "HistGradientBoostingRegressor": HistGradientBoostingRegressor(max_iter=250, learning_rate=0.06, max_leaf_nodes=15, l2_regularization=2.0, random_state=42),
        }
        scores = {}
        for name, candidate in candidates.items():
            candidate.fit(train[cols], train["target"])
            pred = np.maximum(0, candidate.predict(test[cols]))
            scores[name] = mean_absolute_error(test["target"], pred)
        self.model_name = min(scores, key=scores.get)
        self.mae = float(scores[self.model_name])
        self.model = candidates[self.model_name]
        self.model.fit(frame[cols], frame["target"])
        self.validation_scores = {k: round(float(v), 2) for k, v in scores.items()}

    def forecast(self, start_date: str, days: int = 1) -> dict:
        if not 1 <= days <= 90:
            raise ValueError("days phải nằm trong khoảng 1 đến 90")
        requested_start = pd.Timestamp(start_date).normalize()
        if self.history is None or self.model is None:
            raise RuntimeError("Forecast model chưa được khởi tạo")
        history = self.history.copy()
        last_date = history.index[-1].normalize()
        if requested_start <= last_date:
            history = history.loc[:requested_start - pd.Timedelta(days=1)]
            if len(history) < 45:
                raise ValueError("Không đủ lịch sử trước start_date để dự đoán.")
        final_date = requested_start + pd.Timedelta(days=days - 1)
        future_rows = []
        next_date = history.index[-1] + pd.Timedelta(days=1)
        cols = self._feature_columns()
        while next_date <= final_date:
            if len(history) < 28:
                raise ValueError("Cần tối thiểu 28 ngày lịch sử trước ngày dự báo.")
            row = {
                "day_of_week": next_date.dayofweek, "day_of_month": next_date.day,
                "month": next_date.month, "day_of_year": next_date.dayofyear,
                "is_weekend": int(next_date.dayofweek >= 5),
                "lag_1": float(history.iloc[-1]), "lag_7": float(history.iloc[-7]),
                "lag_14": float(history.iloc[-14]), "rolling_mean_7": float(history.iloc[-7:].mean()),
                "rolling_mean_28": float(history.iloc[-28:].mean()),
            }
            prediction = max(0.0, float(self.model.predict(pd.DataFrame([row])[cols])[0]))
            history.loc[next_date] = prediction
            if next_date >= requested_start:
                future_rows.append({"date": next_date.strftime("%Y-%m-%d"), "predicted_revenue_vnd": round(prediction)})
            next_date += pd.Timedelta(days=1)
        return {"start_date": requested_start.strftime("%Y-%m-%d"), "days": days, "currency": "VND",
                "model": self.model_name, "validation_mae_vnd": round(self.mae, 2),
                "validation_scores_mae_vnd": self.validation_scores, "validation_method": "chronological 80/20 holdout",
                "forecast": future_rows}

    def forecast_products(self, target_date: str) -> dict:
        if not ITEMS_PATH.exists():
            raise FileNotFoundError(f"Không tìm thấy {ITEMS_PATH}")
        items = pd.read_csv(ITEMS_PATH, parse_dates=["order_date"])
        target = pd.Timestamp(target_date).normalize()
        if items.empty:
            raise ValueError("Không có dữ liệu order_items.")
        # weekday-specific recent history, back off to overall recent average when sparse
        cutoff = items[items["order_date"] < target]
        results = []
        for (pid, name), group in cutoff.groupby(["product_id", "product_name"]):
            daily = group.groupby("order_date")["quantity"].sum().asfreq("D", fill_value=0)
            recent = daily.tail(56)
            weekday_values = recent[recent.index.dayofweek == target.dayofweek]
            expected = float(weekday_values.mean()) if len(weekday_values) >= 4 else float(recent.mean())
            results.append({"product_id": int(pid), "product_name": name, "predicted_quantity": max(0, int(round(expected)))})
        results.sort(key=lambda x: x["predicted_quantity"], reverse=True)
        return {"forecast_date": target.strftime("%Y-%m-%d"), "method": "recent 8-week weekday mean",
                "note": "Ước lượng baseline; nên thay bằng model demand riêng khi có lịch sử đủ dài.", "products": results}

    def forecast_inventory(self, target_date: str) -> dict:
        product_forecast = self.forecast_products(target_date)["products"]
        inv = pd.read_csv(INVENTORY_PATH)
        recipes = pd.read_csv(RECIPES_PATH)
        demand = {p["product_id"]: p["predicted_quantity"] for p in product_forecast}
        recipes["forecast_usage"] = recipes.apply(lambda r: float(r["quantity_required"]) * demand.get(int(r["product_id"]), 0), axis=1)
        usage = recipes.groupby(["ingredient_id", "ingredient_name", "unit"], as_index=False)["forecast_usage"].sum()
        merged = inv.merge(usage, on=["ingredient_id", "ingredient_name", "unit"], how="left").fillna({"forecast_usage": 0})
        merged["available_stock"] = merged["quantity_in_stock"] - merged["reserved_quantity"]
        merged["recommended_purchase"] = np.maximum(0, merged["forecast_usage"] + merged["reorder_level"] - merged["available_stock"])
        return {"forecast_date": pd.Timestamp(target_date).strftime("%Y-%m-%d"),
                "method": "predicted product demand × Recipes.quantity_required",
                "ingredients": [{k: (round(float(v), 3) if isinstance(v, (np.floating, float)) else (int(v) if isinstance(v, (np.integer,)) else v))
                                 for k, v in row.items()} for row in merged[["ingredient_id","ingredient_name","unit","available_stock","reorder_level","forecast_usage","recommended_purchase"]].to_dict("records")]}


@lru_cache(maxsize=1)
def get_forecast_service() -> RevenueForecastService:
    return RevenueForecastService()
