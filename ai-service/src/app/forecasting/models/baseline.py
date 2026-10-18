"""Gradient-boosting baseline model."""
from sklearn.ensemble import HistGradientBoostingRegressor

def build_hist_gradient_boosting():
    return HistGradientBoostingRegressor(
        max_iter=250, learning_rate=0.06, max_leaf_nodes=15,
        l2_regularization=2.0, random_state=42,
    )
