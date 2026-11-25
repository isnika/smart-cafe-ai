import pytest

from src.app.forecasting.inventory_policy import (
    days_of_cover,
    needs_reorder,
    reorder_point,
    safety_stock,
    service_level_to_z,
)


def test_rop_policy_example():
    z = service_level_to_z(0.95)
    ss = safety_stock(z, 3, 4)
    rop = reorder_point(10, 4, ss)

    assert z == pytest.approx(1.6449, abs=1e-4)
    assert ss == pytest.approx(9.87, abs=1e-2)
    assert rop == pytest.approx(49.87, abs=1e-2)
    assert days_of_cover(30, 10) == pytest.approx(3.0)
    assert needs_reorder(30, rop) is True


@pytest.mark.parametrize("service_level", [0.5, 0.999, 0.2, 1.0])
def test_service_level_must_be_in_open_interval(service_level):
    with pytest.raises(ValueError):
        service_level_to_z(service_level)


def test_zero_demand_has_no_days_of_cover():
    assert days_of_cover(100, 0) is None
    assert safety_stock(1.64, 0, 4) == 0
