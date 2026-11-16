"""Optional XGBoost factory. Install xgboost to enable this candidate."""
def build_xgboost():
    try:
        from xgboost import XGBRegressor
    except ImportError as exc:
        raise ImportError("Cài XGBoost bằng `python -m pip install xgboost` để dùng model này.") from exc
    return XGBRegressor(
        n_estimators=400, max_depth=6, learning_rate=0.04,
        subsample=0.9, colsample_bytree=0.9, objective="reg:squarederror",
        random_state=42, n_jobs=-1,
    )
