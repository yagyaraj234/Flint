import pytest

from app.billing.plans import (
    FREE_PLAN,
    PRO_PLAN,
    is_scan_allowed,
    is_scan_limit_reached,
    scans_included_for,
)


def test_free_plan_quota_under_at_and_over_limit() -> None:
    assert scans_included_for(FREE_PLAN, 5) == 5
    assert is_scan_allowed(FREE_PLAN, 4, 5)
    assert not is_scan_allowed(FREE_PLAN, 5, 5)
    assert not is_scan_allowed(FREE_PLAN, 6, 5)
    assert is_scan_limit_reached(FREE_PLAN, 5, 5)


def test_pro_plan_is_unlimited() -> None:
    assert scans_included_for(PRO_PLAN, 5) is None
    assert is_scan_allowed(PRO_PLAN, 1_000_000, 5)
    assert not is_scan_limit_reached(PRO_PLAN, 1_000_000, 5)


def test_unknown_plan_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown plan"):
        scans_included_for("enterprise")
