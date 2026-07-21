"""Scan entitlement, connection eligibility, and retryable Dodo metering."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.billing.dodo_client import DodoError, ingest_usage_event
from app.billing.plans import FREE_PLAN, PRO_PLAN, scans_included_for
from app.config import get_settings

_UPGRADE_MESSAGE = "Upgrade to Pro to enable automatic sync"


@dataclass(frozen=True)
class ScanEntitlement:
    plan: str
    customer_id: str | None
    scans_used: int
    scans_included: int | None

    @property
    def is_pro(self) -> bool:
        return self.plan == PRO_PLAN


class ScanLimitExceeded(Exception):
    def __init__(self, scans_used: int, scans_included: int) -> None:
        self.scans_used = scans_used
        self.scans_included = scans_included
        super().__init__("free_tier_scan_limit")


def _subscription(db: Any, user_id: str) -> dict[str, Any]:
    result = db.table("subscriptions").select("plan,dodo_customer_id").eq("user_id", user_id).limit(1).execute()
    return result.data[0] if result.data else {}


def _completed_scans_this_month(db: Any, user_id: str, now: datetime) -> int:
    month = now.astimezone(UTC).strftime("%Y-%m")
    rows = db.table("roasts").select("created_at,status").eq("user_id", user_id).execute().data
    return sum(
        row.get("status") == "done" and str(row.get("created_at", "")).startswith(month)
        for row in rows
    )


def scan_entitlement(
    db: Any, user_id: str, requested_scans: int, now: datetime | None = None
) -> ScanEntitlement:
    """Return entitlement or reject a whole batch before any Scan starts."""

    if getattr(get_settings(), "helix_demo", False):
        return ScanEntitlement(PRO_PLAN, None, 0, None)
    subscription = _subscription(db, user_id)
    if subscription.get("plan") == PRO_PLAN:
        customer_id = subscription.get("dodo_customer_id")
        return ScanEntitlement(
            plan=PRO_PLAN,
            customer_id=customer_id if isinstance(customer_id, str) and customer_id else None,
            scans_used=0,
            scans_included=None,
        )
    settings = get_settings()
    included = scans_included_for(FREE_PLAN, settings.free_tier_monthly_scans)
    used = _completed_scans_this_month(db, user_id, now or datetime.now(UTC))
    if included is not None and used + requested_scans > included:
        raise ScanLimitExceeded(used, included)
    return ScanEntitlement(FREE_PLAN, None, used, included)


def pause_connection_for_entitlement(db: Any, connection_id: str, user_id: str) -> None:
    db.table("langsmith_connections").update(
        {"status": "paused", "last_error": _UPGRADE_MESSAGE}
    ).eq("id", connection_id).eq("user_id", user_id).execute()


def queue_completed_scans(
    db: Any, entitlement: ScanEntitlement, user_id: str, scan_slugs: list[str]
) -> None:
    """Persist idempotent usage work; a Dodo failure never changes a completed Scan."""

    if not entitlement.is_pro or not entitlement.customer_id:
        return
    for slug in scan_slugs:
        db.table("usage_events").upsert(
            {
                "roast_slug": slug,
                "user_id": user_id,
                "dodo_customer_id": entitlement.customer_id,
                "event_id": str(uuid4()),
                "status": "pending",
            },
            on_conflict="roast_slug",
            ignore_duplicates=True,
        ).execute()
    flush_pending_usage(db)


def flush_pending_usage(db: Any, limit: int = 100) -> int:
    """Send pending usage events; leave failures pending for the next caller or cron run."""

    settings = get_settings()
    events = db.table("usage_events").select("*").eq("status", "pending").limit(limit).execute().data
    sent = 0
    for event in events:
        try:
            ingest_usage_event(
                str(event["dodo_customer_id"]),
                api_key=settings.dodo_api_key,
                environment=settings.dodo_environment,
                event_id=str(event["event_id"]),
            )
        except DodoError as exc:
            db.table("usage_events").update(
                {
                    "attempts": int(event.get("attempts", 0)) + 1,
                    "last_error": exc.code,
                }
            ).eq("id", event["id"]).execute()
            continue
        db.table("usage_events").update(
            {"status": "sent", "sent_at": datetime.now(UTC).isoformat(), "last_error": None}
        ).eq("id", event["id"]).execute()
        sent += 1
    return sent
