"""Pure inventory policy calculations for reorder-point forecasting."""

from __future__ import annotations

from math import isfinite, sqrt
from statistics import NormalDist


def _nonnegative(value: float) -> float:
    """Return a finite non-negative value for defensive formula boundaries."""

    numeric = float(value)
    return numeric if isfinite(numeric) and numeric > 0 else 0.0


def service_level_to_z(service_level: float) -> float:
    """Convert a service level in ``(0.5, 0.999)`` to a normal z value."""

    level = float(service_level)
    if not isfinite(level) or not 0.5 < level < 0.999:
        raise ValueError("service_level must be strictly between 0.5 and 0.999")
    return NormalDist().inv_cdf(level)


def safety_stock(
    z: float,
    daily_demand_std: float,
    lead_time_days: float,
) -> float:
    """Calculate ``SS = z × sigma_d × sqrt(L)`` with negative inputs clamped."""

    return _nonnegative(z) * _nonnegative(daily_demand_std) * sqrt(
        _nonnegative(lead_time_days)
    )


def reorder_point(
    daily_demand_mean: float,
    lead_time_days: float,
    safety_stock: float,
) -> float:
    """Calculate ``ROP = d_bar × L + SS`` with negative inputs clamped."""

    return (
        _nonnegative(daily_demand_mean) * _nonnegative(lead_time_days)
        + _nonnegative(safety_stock)
    )


def days_of_cover(
    available_stock: float,
    daily_demand_mean: float,
) -> float | None:
    """Return ``available_stock / d_bar`` or ``None`` when ``d_bar`` is zero."""

    demand = _nonnegative(daily_demand_mean)
    if demand == 0:
        return None
    return _nonnegative(available_stock) / demand


def needs_reorder(available_stock: float, reorder_point: float) -> bool:
    """Return whether available stock is at or below the reorder point."""

    return _nonnegative(available_stock) <= _nonnegative(reorder_point)
