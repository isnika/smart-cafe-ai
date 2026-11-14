"""Build/evaluate the forecasting model from one explicit data snapshot."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.app.forecasting.config import get_forecasting_settings  # noqa: E402
from src.app.forecasting.repository import (  # noqa: E402
    DEMO_DATA_DIR,
    DemoForecastingRepository,
    OperationalForecastingRepository,
)
from src.app.forecasting.service import RevenueForecastService  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-mode", choices=["live", "demo"], default=None)
    parser.add_argument("--branch-id", type=int, default=None)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "evaluation" / "forecasting_metrics.json",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = get_forecasting_settings()
    if args.source_mode:
        settings = replace(settings, source_mode=args.source_mode)
    repository = (
        DemoForecastingRepository(DEMO_DATA_DIR, settings)
        if settings.source_mode == "demo"
        else OperationalForecastingRepository(settings)
    )
    snapshot = repository.load_snapshot(branch_id=args.branch_id)
    service = RevenueForecastService(snapshot=snapshot, settings=settings)
    result = {
        "source_mode": service.source_mode,
        "branch_id": service.branch_id,
        "data_version": service.data_version,
        "snapshot_generated_at": str(service.snapshot_generated_at)
        if service.snapshot_generated_at is not None
        else None,
        "data_cutoff_date": service.cutoff_date.strftime("%Y-%m-%d"),
        "timezone": service.timezone,
        "model_version": service.model_version,
        "selected_model": service.model_name,
        "validation": service.evaluation.get("validation", {}),
        "test": service.evaluation.get("test", {}),
        "folds": service.evaluation.get("folds", []),
        "fallback_reason": service.evaluation.get("fallback_reason"),
        "quality": service.quality,
    }
    output = args.output if args.output.is_absolute() else (Path.cwd() / args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
