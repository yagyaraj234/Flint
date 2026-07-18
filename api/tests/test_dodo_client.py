import base64
import hashlib
import hmac
import time
from typing import Any

import httpx
import pytest

from app.billing import dodo_client


def _mock_httpx(monkeypatch: pytest.MonkeyPatch, handler: Any) -> None:
    client_class = httpx.Client
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        dodo_client.httpx,
        "Client",
        lambda **kwargs: client_class(transport=transport, **kwargs),
    )


def test_create_checkout_session(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://test.dodopayments.com/checkouts"
        assert request.headers["Authorization"] == "Bearer api-key"
        assert request.method == "POST"
        assert request.read()
        return httpx.Response(
            200, json={"session_id": "checkout-1", "checkout_url": "https://checkout.test/1"}
        )

    _mock_httpx(monkeypatch, handler)
    assert dodo_client.create_checkout_session(
        "user-1",
        "user@example.com",
        api_key="api-key",
        environment="test_mode",
        product_id="product-1",
    ) == "https://checkout.test/1"


def test_get_customer_balance(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/subscriptions":
            assert request.url.params["customer_id"] == "customer-1"
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "status": "active",
                            "credit_entitlement_cart": [
                                {"credit_entitlement_id": "credits-1"},
                                {"credit_entitlement_id": "credits-2"},
                            ],
                        },
                        {
                            "status": "cancelled",
                            "credit_entitlement_cart": [
                                {"credit_entitlement_id": "ignored"}
                            ],
                        },
                    ]
                },
            )
        balances = {"credits-1": "12.5", "credits-2": "2"}
        entitlement_id = request.url.path.split("/")[2]
        return httpx.Response(200, json={"balance": balances[entitlement_id]})

    _mock_httpx(monkeypatch, handler)
    assert dodo_client.get_customer_balance(
        "customer-1", api_key="api-key", environment="test_mode"
    ) == 14.5


def test_ingest_usage_event(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://live.dodopayments.com/events/ingest"
        body = request.content.decode()
        assert '"customer_id":"customer-1"' in body.replace(" ", "")
        assert '"event_name":"roast.scan"' in body.replace(" ", "")
        return httpx.Response(200, json={"ingested_count": 1})

    _mock_httpx(monkeypatch, handler)
    dodo_client.ingest_usage_event(
        "customer-1", api_key="api-key", environment="live_mode"
    )


def _signature(payload: bytes, secret: str, webhook_id: str, timestamp: str) -> str:
    key = base64.b64decode(secret.removeprefix("whsec_"))
    message = b".".join((webhook_id.encode(), timestamp.encode(), payload))
    value = base64.b64encode(hmac.new(key, message, hashlib.sha256).digest()).decode()
    return f"v1,{value}"


def test_webhook_signature_valid_invalid_and_missing() -> None:
    payload = b'{"type":"subscription.active"}'
    secret = "whsec_c2VjcmV0"
    timestamp = str(int(time.time()))
    headers = {
        "webhook-id": "webhook-1",
        "webhook-timestamp": timestamp,
        "webhook-signature": _signature(payload, secret, "webhook-1", timestamp),
    }
    assert dodo_client.verify_webhook_signature(payload, headers, secret)
    assert not dodo_client.verify_webhook_signature(payload + b" ", headers, secret)
    assert not dodo_client.verify_webhook_signature(payload, {}, secret)
    headers["webhook-timestamp"] = "1"
    assert not dodo_client.verify_webhook_signature(payload, headers, secret)


def test_provider_errors_do_not_leak_response_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_httpx(monkeypatch, lambda _: httpx.Response(500, text="secret provider detail"))
    with pytest.raises(dodo_client.DodoError, match="provider_unavailable"):
        dodo_client.ingest_usage_event(
            "customer-1", api_key="api-key", environment="test_mode"
        )
