"""Authenticated billing status/checkout and Dodo webhook endpoints."""

import json
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.auth import required_user_id
from app.billing.dodo_client import (
    DodoError,
    create_checkout_session,
    get_customer_balance,
    verify_webhook_signature,
)
from app.billing.plans import FREE_PLAN, PRO_PLAN, scans_included_for
from app.config import get_settings
from app.db import get_supabase

router = APIRouter(prefix="/billing", tags=["billing"])

_EVENT_STATUSES = {
    "subscription.active": "active",
    "subscription.renewed": "active",
    "subscription.on_hold": "on_hold",
    "subscription.failed": "failed",
    "subscription.cancelled": "cancelled",
}
_VALID_STATUSES = {"none", "active", "on_hold", "cancelled", "failed"}


class CheckoutResponse(BaseModel):
    checkout_url: str


class BillingStatusResponse(BaseModel):
    plan: Literal["free", "pro"]
    status: str
    scans_used_this_month: int | None = None
    scans_included: int | None = None
    credits_remaining: float | None = None
    current_period_end: str | None = None


def _provider_error(exc: DodoError) -> HTTPException:
    code = (
        status.HTTP_503_SERVICE_UNAVAILABLE
        if exc.code == "provider_not_configured"
        else status.HTTP_502_BAD_GATEWAY
    )
    return HTTPException(status_code=code, detail=exc.code)


def _subscription(db: Any, user_id: str) -> dict[str, Any] | None:
    result = (
        db.table("subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _user_email(db: Any, user_id: str) -> str:
    try:
        response = db.auth.admin.get_user_by_id(user_id)
        user = getattr(response, "user", None)
        email = getattr(user, "email", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="user_email_unavailable"
        ) from exc
    if not isinstance(email, str) or not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_email_unavailable",
        )
    return email


def _monthly_scan_count(db: Any, user_id: str) -> int:
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    result = (
        db.table("roasts")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", month_start.isoformat())
        .execute()
    )
    count = getattr(result, "count", None)
    return count if isinstance(count, int) else len(result.data)


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(user_id: str = Depends(required_user_id)) -> CheckoutResponse:
    settings = get_settings()
    db = get_supabase()
    try:
        checkout_url = create_checkout_session(
            user_id,
            _user_email(db, user_id),
            api_key=settings.dodo_api_key,
            environment=settings.dodo_environment,
            product_id=settings.dodo_pro_product_id,
        )
    except DodoError as exc:
        raise _provider_error(exc) from exc
    return CheckoutResponse(checkout_url=checkout_url)


@router.get("/status", response_model=BillingStatusResponse, response_model_exclude_none=True)
def billing_status(user_id: str = Depends(required_user_id)) -> BillingStatusResponse:
    settings = get_settings()
    db = get_supabase()
    subscription = _subscription(db, user_id)
    if subscription and subscription.get("plan") == PRO_PLAN:
        customer_id = subscription.get("dodo_customer_id")
        if not isinstance(customer_id, str) or not customer_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="provider_response_invalid",
            )
        try:
            credits = get_customer_balance(
                customer_id,
                api_key=settings.dodo_api_key,
                environment=settings.dodo_environment,
            )
        except DodoError as exc:
            raise _provider_error(exc) from exc
        return BillingStatusResponse(
            plan=PRO_PLAN,
            status=str(subscription.get("status", "active")),
            credits_remaining=credits,
            current_period_end=subscription.get("current_period_end"),
        )
    scans_used = _monthly_scan_count(db, user_id)
    return BillingStatusResponse(
        plan=FREE_PLAN,
        status=str(subscription.get("status", "none")) if subscription else "none",
        scans_used_this_month=scans_used,
        scans_included=scans_included_for(
            FREE_PLAN, settings.free_tier_monthly_scans
        ),
    )


def _event_status(event_type: str, data: dict[str, Any]) -> str | None:
    if event_type == "subscription.updated":
        value = data.get("status")
        if value == "expired":
            return "cancelled"
        if value == "pending":
            return "none"
        return value if isinstance(value, str) and value in _VALID_STATUSES else None
    return _EVENT_STATUSES.get(event_type)


@router.post("/webhook")
async def webhook(request: Request) -> dict[str, object]:
    settings = get_settings()
    payload = await request.body()
    if not verify_webhook_signature(payload, request.headers, settings.dodo_webhook_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_webhook_signature"
        )
    try:
        event = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_webhook_payload"
        ) from exc
    if not isinstance(event, dict) or not isinstance(event.get("data"), dict):
        return {}
    event_type = event.get("type")
    data: dict[str, Any] = event["data"]
    if not isinstance(event_type, str):
        return {}
    subscription_status = _event_status(event_type, data)
    if subscription_status is None:
        return {}
    if settings.dodo_pro_product_id and data.get("product_id") != settings.dodo_pro_product_id:
        return {}
    metadata = data.get("metadata")
    customer = data.get("customer")
    user_id = metadata.get("user_id") if isinstance(metadata, dict) else None
    customer_id = customer.get("customer_id") if isinstance(customer, dict) else data.get("customer_id")
    subscription_id = data.get("subscription_id")
    if not all(isinstance(value, str) and value for value in (user_id, customer_id, subscription_id)):
        return {}
    get_supabase().table("subscriptions").upsert(
        {
            "user_id": user_id,
            "plan": PRO_PLAN if subscription_status == "active" else FREE_PLAN,
            "status": subscription_status,
            "dodo_customer_id": customer_id,
            "dodo_subscription_id": subscription_id,
            "current_period_end": data.get("next_billing_date"),
            "updated_at": datetime.now(UTC).isoformat(),
        },
        on_conflict="user_id",
    ).execute()
    return {}
