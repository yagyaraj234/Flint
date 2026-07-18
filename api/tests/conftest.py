"""Shared fake Supabase client so tests never touch the network."""

import json
from typing import Any

import pytest


class FakeQuery:
    def __init__(self, store: list[dict[str, Any]]):
        self.store = store
        self._filters: list[tuple[str, Any]] = []
        self._not_filters: list[tuple[str, Any]] = []
        self._limit: int | None = None
        self._update: dict[str, Any] | None = None
        self._order: tuple[str, bool] | None = None

    def select(self, *_: Any) -> "FakeQuery":
        return self

    def insert(self, row: dict[str, Any]) -> "FakeQuery":
        self.store.append({"id": f"id-{len(self.store)}", "created_at": "2026-07-18T10:00:00Z", **row})
        return self

    def update(self, patch: dict[str, Any]) -> "FakeQuery":
        self._update = patch
        return self

    def eq(self, col: str, val: Any) -> "FakeQuery":
        self._filters.append((col, val))
        return self

    def neq(self, col: str, val: Any) -> "FakeQuery":
        self._not_filters.append((col, val))
        return self

    def order(self, column: str, *, desc: bool = False) -> "FakeQuery":
        self._order = (column, desc)
        return self

    def limit(self, n: int) -> "FakeQuery":
        self._limit = n
        return self

    def execute(self) -> Any:
        rows = [
            r
            for r in self.store
            if all(r.get(c) == v for c, v in self._filters)
            and all(r.get(c) != v for c, v in self._not_filters)
        ]
        if self._update is not None:
            for row in rows:
                row.update(self._update)
        if self._order is not None:
            column, descending = self._order
            rows.sort(key=lambda row: row.get(column), reverse=descending)
        if self._limit is not None:
            rows = rows[: self._limit]
        return type("Result", (), {"data": rows})()


class FakeSupabase:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.auth = FakeAuth()

    def table(self, _name: str) -> FakeQuery:
        return FakeQuery(self.rows)

    def dump(self) -> str:
        return json.dumps(self.rows)


class FakeAuth:
    def get_user(self, token: str) -> Any:
        if token != "good-token-user-1":
            raise ValueError("invalid token")
        user = type("User", (), {"id": "user-1"})()
        return type("UserResponse", (), {"user": user})()


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr("app.pipeline.get_supabase", lambda: fake)
    monkeypatch.setattr("app.auth.get_supabase", lambda: fake)
    monkeypatch.setattr("app.routers.roasts.get_supabase", lambda: fake)
    monkeypatch.setattr("app.routers.me.get_supabase", lambda: fake)
    # never call OpenAI from tests; Luna failures must fall back cleanly.
    monkeypatch.setattr("app.pipeline.generate_luna_assessment", lambda *args: None)
    return fake
