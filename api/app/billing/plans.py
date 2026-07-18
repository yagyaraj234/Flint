"""Pure billing plan and scan quota rules."""

FREE_PLAN = "free"
PRO_PLAN = "pro"
PLANS = frozenset({FREE_PLAN, PRO_PLAN})


def scans_included_for(plan: str, free_tier_monthly_scans: int = 5) -> int | None:
    """Return monthly included scans, or None for an unlimited plan."""

    if plan == PRO_PLAN:
        return None
    if plan == FREE_PLAN:
        return max(0, free_tier_monthly_scans)
    raise ValueError(f"unknown plan: {plan}")


def is_scan_allowed(
    plan: str, scans_used: int, free_tier_monthly_scans: int = 5
) -> bool:
    """Return whether one more scan may start."""

    included = scans_included_for(plan, free_tier_monthly_scans)
    return included is None or scans_used < included


def is_scan_limit_reached(
    plan: str, scans_used: int, free_tier_monthly_scans: int = 5
) -> bool:
    """Return whether the plan has exhausted its monthly scans."""

    return not is_scan_allowed(plan, scans_used, free_tier_monthly_scans)
