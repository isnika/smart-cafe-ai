from __future__ import annotations

import pandas as pd


def min_max_normalize(values: list[float]) -> list[float]:
    if not values:
        return []
    low, high = min(values), max(values)
    if high == low:
        return [1.0 for _ in values]
    return [(x - low) / (high - low) for x in values]


def hybrid_merge(
    content_results: list[dict],
    collaborative_results: list[dict],
    top_k: int = 5,
    content_weight: float = 0.5,
    collaborative_weight: float = 0.5,
) -> list[dict]:
    content_scores = min_max_normalize([x["score"] for x in content_results])
    cf_scores = min_max_normalize([x["score"] for x in collaborative_results])

    merged: dict[int, dict] = {}

    for item, score in zip(content_results, content_scores):
        pid = item["product_id"]
        merged.setdefault(pid, {"product_id": pid})
        merged[pid]["content_score"] = score

    for item, score in zip(collaborative_results, cf_scores):
        pid = item["product_id"]
        merged.setdefault(pid, {"product_id": pid})
        merged[pid]["collaborative_score"] = score

    for item in merged.values():
        item["content_score"] = item.get("content_score", 0.0)
        item["collaborative_score"] = item.get("collaborative_score", 0.0)
        item["score"] = (
            content_weight * item["content_score"]
            + collaborative_weight * item["collaborative_score"]
        )

    return sorted(merged.values(), key=lambda x: x["score"], reverse=True)[:top_k]
