"""Shared fake Supabase client so tests never touch the network."""

import json
from typing import Any

import pytest


class FakeQuery:
    def __init__(self, store: list[dict[str, Any]]):
        self.store = store
        self._filters: list[tuple[str, Any]] = []
        self._limit: int | None = None
        self._update: dict[str, Any] | None = None

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

    def order(self, *_: Any, **__: Any) -> "FakeQuery":
        return self

    def limit(self, n: int) -> "FakeQuery":
        self._limit = n
        return self

    def execute(self) -> Any:
        rows = [r for r in self.store if all(r.get(c) == v for c, v in self._filters)]
        if self._update is not None:
            for row in rows:
                row.update(self._update)
        if self._limit is not None:
            rows = rows[: self._limit]
        return type("Result", (), {"data": rows})()


class FakeSupabase:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def table(self, _name: str) -> FakeQuery:
        return FakeQuery(self.rows)

    def dump(self) -> str:
        return json.dumps(self.rows)


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr("app.pipeline.get_supabase", lambda: fake)
    monkeypatch.setattr("app.routers.roasts.get_supabase", lambda: fake)
    monkeypatch.setattr("app.roast_line.get_supabase", lambda: fake)
    # never call OpenAI from tests; the fallback line path is what's under test
    monkeypatch.setattr("app.roast_line.generate_roast_line", lambda *args: None)
    return fake
