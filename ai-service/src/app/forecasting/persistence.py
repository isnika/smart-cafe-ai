"""Versioned persistence for forecasting models and their evaluation metadata."""

from __future__ import annotations

import io
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

import joblib

from .features import FEATURE_COLUMNS

logger = logging.getLogger(__name__)

ARTIFACT_SCHEMA_VERSION = 1
PIPELINE_VERSION = "forecasting-pipeline-v1"
DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "forecasting"


class ForecastArtifactError(ValueError):
    """Raised when a saved forecasting artifact is unsafe to use."""


def resolve_artifact_dir(value: str | Path | None) -> Path:
    """Resolve an artifact directory without relying on the caller's cwd."""

    path = Path(value) if value else DEFAULT_ARTIFACT_DIR
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[3] / path
    return path


def artifact_paths(
    artifact_dir: str | Path | None,
    *,
    source_mode: str,
    branch_id: int,
) -> tuple[Path, Path]:
    directory = resolve_artifact_dir(artifact_dir) / source_mode
    stem = f"branch-{int(branch_id)}"
    return directory / f"{stem}.joblib", directory / f"{stem}.json"


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _atomic_write_text(path: Path, payload: str) -> None:
    _atomic_write_bytes(path, payload.encode("utf-8"))


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except ValueError:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except (AttributeError, TypeError, ValueError):
            pass
    return value


def save_artifact(
    *,
    artifact_dir: str | Path | None,
    source_mode: str,
    branch_id: int,
    model: Any,
    metadata: dict[str, Any],
) -> tuple[Path, Path]:
    """Persist the model and a human-readable metadata sidecar atomically."""

    joblib_path, metadata_path = artifact_paths(
        artifact_dir,
        source_mode=source_mode,
        branch_id=branch_id,
    )
    payload = {
        "metadata": {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "pipeline_version": PIPELINE_VERSION,
            "feature_schema": list(FEATURE_COLUMNS),
            **metadata,
        },
        "model": model,
    }
    buffer = io.BytesIO()
    joblib.dump(payload, buffer, compress=3)
    _atomic_write_bytes(joblib_path, buffer.getvalue())
    _atomic_write_text(
        metadata_path,
        json.dumps(_json_safe(payload["metadata"]), ensure_ascii=False, indent=2, default=str),
    )
    return joblib_path, metadata_path


def _validate_metadata(
    metadata: Any,
    *,
    source_mode: str,
    branch_id: int,
    data_version: str,
    model_version: str,
    evaluation_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        raise ForecastArtifactError("artifact metadata must be an object")
    if metadata.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ForecastArtifactError("artifact schema version is unsupported")
    if metadata.get("pipeline_version") != PIPELINE_VERSION:
        raise ForecastArtifactError("artifact pipeline version is unsupported")
    if metadata.get("feature_schema") != list(FEATURE_COLUMNS):
        raise ForecastArtifactError("artifact feature schema does not match the running code")
    expected = {
        "source_mode": source_mode,
        "branch_id": int(branch_id),
        "data_version": data_version,
        "model_version": model_version,
        "target": "daily_revenue_vnd",
    }
    for key, expected_value in expected.items():
        if metadata.get(key) != expected_value:
            raise ForecastArtifactError(f"artifact metadata mismatch: {key}")
    if evaluation_config is not None and metadata.get("evaluation_config") != evaluation_config:
        raise ForecastArtifactError("artifact metadata mismatch: evaluation_config")
    selected_model = str(metadata.get("selected_model", ""))
    if not selected_model:
        raise ForecastArtifactError("artifact selected_model is missing")
    return metadata


def load_artifact(
    *,
    artifact_dir: str | Path | None,
    source_mode: str,
    branch_id: int,
    data_version: str,
    model_version: str,
    evaluation_config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Load a matching artifact, returning ``None`` for a miss or bad artifact."""

    joblib_path, _ = artifact_paths(
        artifact_dir,
        source_mode=source_mode,
        branch_id=branch_id,
    )
    if not joblib_path.exists():
        return None
    try:
        payload = joblib.load(joblib_path)
        if not isinstance(payload, dict):
            raise ForecastArtifactError("artifact payload must be an object")
        metadata = _validate_metadata(
            payload.get("metadata"),
            source_mode=source_mode,
            branch_id=branch_id,
            data_version=data_version,
            model_version=model_version,
            evaluation_config=evaluation_config,
        )
        selected_model = str(metadata["selected_model"])
        model = payload.get("model")
        if selected_model not in {"SeasonalNaive", "WeekdayMean8Weeks"}:
            if model is None or not callable(getattr(model, "predict", None)):
                raise ForecastArtifactError("trained model is missing predict()")
        return {
            "model": model,
            "model_name": selected_model,
            "evaluation": metadata.get("evaluation", {}),
            "metadata": metadata,
            "path": joblib_path,
        }
    except Exception as exc:  # corrupt/mismatched artifacts must not break serving
        logger.warning(
            "Ignoring forecasting artifact path=%s error_type=%s",
            joblib_path,
            type(exc).__name__,
        )
        return None
