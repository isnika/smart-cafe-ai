"""Tree ensemble model factories."""
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor

def build_random_forest():
    return RandomForestRegressor(
        n_estimators=350, max_depth=12, min_samples_leaf=2,
        max_features=0.9, random_state=42, n_jobs=-1,
    )

def build_extra_trees():
    return ExtraTreesRegressor(
        n_estimators=350, max_depth=14, min_samples_leaf=2,
        max_features=0.9, random_state=42, n_jobs=-1,
    )
