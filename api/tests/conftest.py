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
        self._upsert: tuple[dict[str, Any], tuple[str, ...]] | None = None
        self._delete = False

    def select(self, *_: Any) -> "FakeQuery":
        return self

    def insert(self, row: dict[str, Any]) -> "FakeQuery":
        self.store.append(
            {
                "id": f"id-{len(self.store)}",
                "created_at": "2026-07-18T10:00:00Z",
                "visibility": "public",
                **row,
            }
        )
        return self

    def upsert(self, row: dict[str, Any], *, on_conflict: str) -> "FakeQuery":
        self._upsert = (row, tuple(on_conflict.split(",")))
        return self

    def delete(self) -> "FakeQuery":
        self._delete = True
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
        if self._upsert is not None:
            row, conflict_columns = self._upsert
            existing = next(
                (
                    candidate
                    for candidate in self.store
                    if all(candidate.get(column) == row.get(column) for column in conflict_columns)
                ),
                None,
            )
            if existing is None:
                self.store.append(
                    {
                        "id": f"id-{len(self.store)}",
                        "created_at": "2026-07-18T10:00:00Z",
                        **row,
                    }
                )
            else:
                existing.update(row)
        rows = [
            r
            for r in self.store
            if all(r.get(c) == v for c, v in self._filters)
            and all(r.get(c) != v for c, v in self._not_filters)
        ]
        if self._update is not None:
            for row in rows:
                row.update(self._update)
        if self._delete:
            for row in rows:
                self.store.remove(row)
        if self._order is not None:
            column, descending = self._order
            rows.sort(key=lambda row: row.get(column), reverse=descending)
        if self._limit is not None:
            rows = rows[: self._limit]
        return type("Result", (), {"data": rows})()


class FakeSupabase:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.report_shares: list[dict[str, Any]] = []
        self.auth = FakeAuth()

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.report_shares if name == "report_shares" else self.rows)

    def dump(self) -> str:
        return json.dumps(self.rows)


class FakeAuth:
    def get_user(self, token: str) -> Any:
        users = {
            "good-token-user-1": ("user-1", "owner@example.com"),
            "good-token-user-2": ("user-2", "shared@example.com"),
            "good-token-user-3": ("user-3", "other@example.com"),
        }
        if token not in users:
            raise ValueError("invalid token")
        user_id, email = users[token]
        user = type("User", (), {"id": user_id, "email": email})()
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
