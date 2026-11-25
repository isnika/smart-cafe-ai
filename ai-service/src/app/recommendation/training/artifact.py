from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

import joblib


ARTIFACT_SCHEMA_VERSION = 1


def resolve_path(path: str | Path, *, base_dir: Path | None = None) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return (base_dir or Path.cwd()) / candidate


def save_artifact(path: str | Path, payload: dict[str, Any]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        suffix=target.suffix,
        prefix=f".{target.stem}.",
        dir=target.parent,
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
    try:
        joblib.dump(payload, temporary, compress=3)
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()

    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        metadata_path = target.with_suffix(".metadata.json")
        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2, default=str) + "\n",
            encoding="utf-8",
        )
    return target


def load_artifact(path: str | Path) -> dict[str, Any]:
    payload = joblib.load(path)
    if not isinstance(payload, dict):
        raise ValueError("Recommendation artifact phải là dictionary.")
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("Recommendation artifact thiếu metadata.")
    if metadata.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ValueError("Recommendation artifact không tương thích schema hiện tại.")
    if not metadata.get("algorithm") or not metadata.get("model_version"):
        raise ValueError("Recommendation artifact thiếu algorithm/model_version.")
    if not isinstance(payload.get("scores_by_user"), dict):
        raise ValueError("Recommendation artifact thiếu scores_by_user.")
    if not isinstance(payload.get("fallback_scores"), dict):
        raise ValueError("Recommendation artifact thiếu fallback_scores.")
    return payload
