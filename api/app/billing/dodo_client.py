"""Minimal Dodo Payments HTTP client and webhook verification."""

import base64
import binascii
import hashlib
import hmac
import time
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx

_BASE_URLS = {
    "test_mode": "https://test.dodopayments.com",
    "live_mode": "https://live.dodopayments.com",
}


class DodoError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def _request(
    method: str,
    path: str,
    *,
    api_key: str,
    environment: str,
    **kwargs: Any,
) -> dict[str, Any]:
    if not api_key:
        raise DodoError("provider_not_configured")
    try:
        base_url = _BASE_URLS[environment]
    except KeyError as exc:
        raise ValueError("Dodo environment must be test_mode or live_mode") from exc
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.request(
                method,
                f"{base_url}{path}",
                headers={"Authorization": f"Bearer {api_key}"},
                **kwargs,
            )
    except httpx.TimeoutException as exc:
        raise DodoError("provider_timeout") from exc
    except httpx.HTTPError as exc:
        raise DodoError("provider_unavailable") from exc
    if response.status_code >= 500:
        raise DodoError("provider_unavailable")
    if response.is_error:
        raise DodoError("provider_request_failed")
    try:
        data = response.json()
    except ValueError as exc:
        raise DodoError("provider_response_invalid") from exc
    if not isinstance(data, dict):
        raise DodoError("provider_response_invalid")
    return data


def create_checkout_session(
    user_id: str,
    email: str,
    *,
    api_key: str,
    environment: str,
    product_id: str,
) -> str:
    """Create the single Pro-product checkout and return its hosted URL."""

    if not product_id:
        raise DodoError("provider_not_configured")
    data = _request(
        "POST",
        "/checkouts",
        api_key=api_key,
        environment=environment,
        json={
            "product_cart": [{"product_id": product_id, "quantity": 1}],
            "customer": {"email": email},
            "metadata": {"user_id": user_id},
        },
    )
    checkout_url = data.get("checkout_url")
    if not isinstance(checkout_url, str) or not checkout_url:
        raise DodoError("provider_response_invalid")
    return checkout_url


def get_customer_balance(
    dodo_customer_id: str, *, api_key: str, environment: str
) -> float:
    """Return credit balances granted by the customer's active subscription."""

    data = _request(
        "GET",
        "/subscriptions",
        api_key=api_key,
        environment=environment,
        params={"customer_id": dodo_customer_id, "page_size": 100},
    )
    items = data.get("items")
    if not isinstance(items, list):
        raise DodoError("provider_response_invalid")
    entitlement_ids: set[str] = set()
    for subscription in items:
        if not isinstance(subscription, dict) or subscription.get("status") != "active":
            continue
        cart = subscription.get("credit_entitlement_cart")
        if not isinstance(cart, list):
            continue
        for entitlement in cart:
            if not isinstance(entitlement, dict):
                continue
            entitlement_id = entitlement.get("credit_entitlement_id")
            if isinstance(entitlement_id, str) and entitlement_id:
                entitlement_ids.add(entitlement_id)
    balance = 0.0
    for entitlement_id in entitlement_ids:
        data = _request(
            "GET",
            f"/credit-entitlements/{quote(entitlement_id, safe='')}/balances/"
            f"{quote(dodo_customer_id, safe='')}",
            api_key=api_key,
            environment=environment,
        )
        try:
            balance += float(data["balance"])
        except (KeyError, TypeError, ValueError):
            raise DodoError("provider_response_invalid") from None
    return balance


def ingest_usage_event(
    dodo_customer_id: str,
    event_name: str = "roast.scan",
    *,
    api_key: str,
    environment: str,
) -> None:
    """Send one idempotent usage event to Dodo."""

    _request(
        "POST",
        "/events/ingest",
        api_key=api_key,
        environment=environment,
        json={
            "events": [
                {
                    "customer_id": dodo_customer_id,
                    "event_id": str(uuid4()),
                    "event_name": event_name,
                }
            ]
        },
    )


def _header(headers: Mapping[str, str], name: str) -> str | None:
    return next((value for key, value in headers.items() if key.lower() == name), None)


def verify_webhook_signature(
    payload_bytes: bytes, headers: Mapping[str, str], secret: str
) -> bool:
    """Verify Dodo's Standard Webhooks HMAC-SHA256 signature."""

    webhook_id = _header(headers, "webhook-id")
    timestamp = _header(headers, "webhook-timestamp")
    signature = _header(headers, "webhook-signature")
    if not secret or not webhook_id or not timestamp or not signature:
        return False
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False
    encoded_secret = secret.removeprefix("whsec_")
    try:
        key = base64.b64decode(encoded_secret, validate=True)
    except (binascii.Error, ValueError):
        return False
    message = b".".join((webhook_id.encode(), timestamp.encode(), payload_bytes))
    expected = base64.b64encode(hmac.new(key, message, hashlib.sha256).digest()).decode()
    return any(
        version == "v1" and hmac.compare_digest(value, expected)
        for token in signature.split()
        for version, separator, value in (token.partition(","),)
        if separator
    )
