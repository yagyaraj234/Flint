import base64
import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.routers import billing

HEADERS = {"Authorization": "Bearer good-token-user-1"}
client = TestClient(app)


class FakeQuery:
    def __init__(self, db: "FakeDb", table: str) -> None:
        self.db = db
        self.table = table
        self.filters: list[tuple[str, Any]] = []
        self.minimums: list[tuple[str, str]] = []
        self.limit_value: int | None = None
        self.upsert_row: dict[str, Any] | None = None

    def select(self, *_: Any, **__: Any) -> "FakeQuery":
        return self

    def eq(self, field: str, value: Any) -> "FakeQuery":
        self.filters.append((field, value))
        return self

    def gte(self, field: str, value: str) -> "FakeQuery":
        self.minimums.append((field, value))
        return self

    def limit(self, value: int) -> "FakeQuery":
        self.limit_value = value
        return self

    def upsert(self, row: dict[str, Any], **_: Any) -> "FakeQuery":
        self.upsert_row = row
        return self

    def execute(self) -> Any:
        rows = self.db.rows[self.table]
        if self.upsert_row is not None:
            existing = next(
                (row for row in rows if row.get("user_id") == self.upsert_row["user_id"]),
                None,
            )
            if existing is None:
                rows.append(self.upsert_row)
            else:
                existing.update(self.upsert_row)
        matched = [
            row
            for row in rows
            if all(row.get(key) == value for key, value in self.filters)
            and all(str(row.get(key, "")) >= value for key, value in self.minimums)
        ]
        if self.limit_value is not None:
            matched = matched[: self.limit_value]
        return type("Result", (), {"data": matched, "count": len(matched)})()


class FakeAdmin:
    def get_user_by_id(self, user_id: str) -> Any:
        user = type("User", (), {"id": user_id, "email": "user@example.com"})()
        return type("Response", (), {"user": user})()


class FakeAuth:
    def __init__(self) -> None:
        self.admin = FakeAdmin()

    def get_user(self, token: str) -> Any:
        if token != "good-token-user-1":
            raise ValueError("invalid token")
        user = type("User", (), {"id": "user-1"})()
        return type("Response", (), {"user": user})()


class FakeDb:
    def __init__(self) -> None:
        self.rows: dict[str, list[dict[str, Any]]] = {
            "subscriptions": [],
            "roasts": [],
        }
        self.auth = FakeAuth()

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


@pytest.fixture
def billing_db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    db = FakeDb()
    monkeypatch.setattr("app.auth.get_supabase", lambda: db)
    monkeypatch.setattr(billing, "get_supabase", lambda: db)
    monkeypatch.setenv("DODO_API_KEY", "api-key")
    monkeypatch.setenv("DODO_ENVIRONMENT", "test_mode")
    monkeypatch.setenv("DODO_WEBHOOK_SECRET", "whsec_c2VjcmV0")
    monkeypatch.setenv("DODO_PRO_PRODUCT_ID", "product-1")
    monkeypatch.setenv("FREE_TIER_MONTHLY_SCANS", "5")
    get_settings.cache_clear()
    yield db
    get_settings.cache_clear()


def test_checkout_requires_auth_and_returns_hosted_url(
    billing_db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert client.post("/billing/checkout", json={}).status_code == 401
    calls: list[tuple[str, str]] = []

    def create(user_id: str, email: str, **_: Any) -> str:
        calls.append((user_id, email))
        return "https://checkout.test/session"

    monkeypatch.setattr(billing, "create_checkout_session", create)
    response = client.post("/billing/checkout", json={}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"checkout_url": "https://checkout.test/session"}
    assert calls == [("user-1", "user@example.com")]


def test_free_status_counts_current_month_scans(billing_db: FakeDb) -> None:
    now = datetime.now(UTC)
    billing_db.rows["roasts"].extend(
        [
            {"id": "current", "user_id": "user-1", "created_at": now.isoformat()},
            {"id": "other", "user_id": "user-2", "created_at": now.isoformat()},
            {"id": "old", "user_id": "user-1", "created_at": "2020-01-01T00:00:00+00:00"},
        ]
    )
    response = client.get("/billing/status", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {
        "plan": "free",
        "status": "none",
        "scans_used_this_month": 1,
        "scans_included": 5,
    }


def test_pro_status_returns_dodo_balance(
    billing_db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    billing_db.rows["subscriptions"].append(
        {
            "user_id": "user-1",
            "plan": "pro",
            "status": "active",
            "dodo_customer_id": "customer-1",
            "current_period_end": "2026-08-18T00:00:00Z",
        }
    )
    monkeypatch.setattr(billing, "get_customer_balance", lambda *_args, **_kwargs: 42.0)
    response = client.get("/billing/status", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {
        "plan": "pro",
        "status": "active",
        "credits_remaining": 42.0,
        "current_period_end": "2026-08-18T00:00:00Z",
    }


def _signed_headers(payload: bytes) -> dict[str, str]:
    secret = "whsec_c2VjcmV0"
    webhook_id = "webhook-1"
    timestamp = str(int(time.time()))
    key = base64.b64decode(secret.removeprefix("whsec_"))
    message = b".".join((webhook_id.encode(), timestamp.encode(), payload))
    signature = base64.b64encode(hmac.new(key, message, hashlib.sha256).digest()).decode()
    return {
        "webhook-id": webhook_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": f"v1,{signature}",
        "content-type": "application/json",
    }


@pytest.mark.parametrize(
    ("event_type", "dodo_status", "expected_status", "expected_plan"),
    [
        ("subscription.active", "active", "active", "pro"),
        ("subscription.renewed", "active", "active", "pro"),
        ("subscription.on_hold", "on_hold", "on_hold", "free"),
        ("subscription.failed", "failed", "failed", "free"),
        ("subscription.cancelled", "cancelled", "cancelled", "free"),
        ("subscription.updated", "active", "active", "pro"),
    ],
)
def test_webhook_upserts_subscription_states(
    billing_db: FakeDb,
    event_type: str,
    dodo_status: str,
    expected_status: str,
    expected_plan: str,
) -> None:
    payload = json.dumps(
        {
            "type": event_type,
            "data": {
                "product_id": "product-1",
                "subscription_id": "subscription-1",
                "status": dodo_status,
                "next_billing_date": "2026-08-18T00:00:00Z",
                "metadata": {"user_id": "user-1"},
                "customer": {"customer_id": "customer-1"},
            },
        },
        separators=(",", ":"),
    ).encode()
    response = client.post("/billing/webhook", content=payload, headers=_signed_headers(payload))
    assert response.status_code == 200
    assert response.json() == {}
    assert billing_db.rows["subscriptions"][0]["status"] == expected_status
    assert billing_db.rows["subscriptions"][0]["plan"] == expected_plan


def test_webhook_rejects_missing_signature(billing_db: FakeDb) -> None:
    response = client.post("/billing/webhook", json={"type": "subscription.active"})
    assert response.status_code == 401
    assert billing_db.rows["subscriptions"] == []
