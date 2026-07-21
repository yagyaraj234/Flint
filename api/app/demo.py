"""Small in-memory Supabase-compatible store for the no-key demo mode."""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import RLock
from typing import Any, Literal
from urllib.parse import unquote
from uuid import uuid4

_DEMO_TOKEN_PREFIX = "demo:"
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def demo_identity(token: str) -> tuple[str, str]:
    """Return a stable local user ID and email from a browser demo token."""

    if not token.startswith(_DEMO_TOKEN_PREFIX):
        raise ValueError("invalid demo token")
    email = unquote(token.removeprefix(_DEMO_TOKEN_PREFIX)).strip().lower()
    if _EMAIL.fullmatch(email) is None:
        raise ValueError("invalid demo token")
    return token, email


@dataclass
class DemoResponse:
    data: list[dict[str, Any]]
    count: int | None = None


@dataclass
class _DemoUser:
    id: str
    email: str


class _DemoAuthAdmin:
    def get_user_by_id(self, user_id: str) -> Any:
        _, email = demo_identity(user_id)
        return type("UserResponse", (), {"user": _DemoUser(user_id, email)})()


class _DemoAuth:
    admin = _DemoAuthAdmin()

    def get_user(self, token: str) -> Any:
        user_id, email = demo_identity(token)
        return type("UserResponse", (), {"user": _DemoUser(user_id, email)})()


class DemoQuery:
    """Subset of PostgREST's query builder used by Helix routes."""

    def __init__(self, store: "DemoSupabase", table: str) -> None:
        self._store = store
        self._table = table
        self._operation: Literal["select", "insert", "upsert", "update", "delete"] = "select"
        self._payload: list[dict[str, Any]] = []
        self._filters: list[tuple[str, Any]] = []
        self._not_filters: list[tuple[str, Any]] = []
        self._gte_filters: list[tuple[str, Any]] = []
        self._or_filters: list[str] = []
        self._columns = "*"
        self._count_requested = False
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._conflict_columns: tuple[str, ...] = ()
        self._ignore_duplicates = False

    def select(self, columns: str = "*", *, count: str | None = None) -> "DemoQuery":
        self._columns = columns
        self._count_requested = count == "exact"
        return self

    def insert(self, rows: dict[str, Any] | list[dict[str, Any]]) -> "DemoQuery":
        self._operation = "insert"
        self._payload = [rows] if isinstance(rows, dict) else rows
        return self

    def upsert(
        self,
        rows: dict[str, Any] | list[dict[str, Any]],
        *,
        on_conflict: str,
        ignore_duplicates: bool = False,
    ) -> "DemoQuery":
        self._operation = "upsert"
        self._payload = [rows] if isinstance(rows, dict) else rows
        self._conflict_columns = tuple(column.strip() for column in on_conflict.split(","))
        self._ignore_duplicates = ignore_duplicates
        return self

    def update(self, patch: dict[str, Any]) -> "DemoQuery":
        self._operation = "update"
        self._payload = [patch]
        return self

    def delete(self) -> "DemoQuery":
        self._operation = "delete"
        return self

    def eq(self, column: str, value: Any) -> "DemoQuery":
        self._filters.append((column, value))
        return self

    def neq(self, column: str, value: Any) -> "DemoQuery":
        self._not_filters.append((column, value))
        return self

    def gte(self, column: str, value: Any) -> "DemoQuery":
        self._gte_filters.append((column, value))
        return self

    def or_(self, expression: str) -> "DemoQuery":
        self._or_filters.append(expression)
        return self

    def order(self, column: str, *, desc: bool = False) -> "DemoQuery":
        self._order = (column, desc)
        return self

    def limit(self, value: int) -> "DemoQuery":
        self._limit = value
        return self

    def _matches(self, row: dict[str, Any]) -> bool:
        if not all(row.get(column) == value for column, value in self._filters):
            return False
        if not all(row.get(column) != value for column, value in self._not_filters):
            return False
        if not all(
            row.get(column) is not None and str(row[column]) >= str(value)
            for column, value in self._gte_filters
        ):
            return False
        return all(self._matches_or(row, expression) for expression in self._or_filters)

    @staticmethod
    def _matches_or(row: dict[str, Any], expression: str) -> bool:
        for part in expression.split(","):
            column, operator, value = part.split(".", 2)
            actual = row.get(column)
            if operator == "is" and value == "null" and actual is None:
                return True
            if operator == "lt" and actual is not None and str(actual) < value:
                return True
        return False

    def _selected(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self._order is not None:
            column, descending = self._order
            rows.sort(
                key=lambda row: (row.get(column) is None, str(row.get(column, ""))),
                reverse=descending,
            )
        if self._limit is not None:
            rows = rows[: self._limit]
        if self._columns == "*":
            return copy.deepcopy(rows)
        columns = [column.strip() for column in self._columns.split(",")]
        return [
            {column: copy.deepcopy(row[column]) for column in columns if column in row}
            for row in rows
        ]

    def execute(self) -> DemoResponse:
        with self._store._lock:
            rows = self._store._tables.setdefault(self._table, [])
            matches = [row for row in rows if self._matches(row)]
            count = len(matches) if self._count_requested else None
            if self._operation == "insert":
                inserted = [self._store._new_row(self._table, row) for row in self._payload]
                rows.extend(inserted)
                return DemoResponse(copy.deepcopy(inserted))
            if self._operation == "upsert":
                result: list[dict[str, Any]] = []
                for payload in self._payload:
                    existing = next(
                        (
                            row
                            for row in rows
                            if all(row.get(column) == payload.get(column) for column in self._conflict_columns)
                        ),
                        None,
                    )
                    if existing is None:
                        existing = self._store._new_row(self._table, payload)
                        rows.append(existing)
                    elif not self._ignore_duplicates:
                        existing.update(copy.deepcopy(payload))
                    result.append(existing)
                return DemoResponse(copy.deepcopy(result))
            if self._operation == "update":
                patch = self._payload[0]
                for row in matches:
                    row.update(copy.deepcopy(patch))
                return DemoResponse(copy.deepcopy(matches))
            if self._operation == "delete":
                rows[:] = [row for row in rows if row not in matches]
                return DemoResponse(copy.deepcopy(matches))
            return DemoResponse(self._selected(matches), count=count)


class DemoSupabase:
    """Ephemeral demo storage. It exists only while the API process runs."""

    def __init__(self) -> None:
        # ponytail: one process only; use Supabase for persistent concurrent production data.
        self._lock = RLock()
        self._tables: dict[str, list[dict[str, Any]]] = {}
        self.auth = _DemoAuth()

    def table(self, name: str) -> DemoQuery:
        return DemoQuery(self, name)

    @staticmethod
    def _new_row(table: str, payload: dict[str, Any]) -> dict[str, Any]:
        row: dict[str, Any] = {
            "id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            **copy.deepcopy(payload),
        }
        if table == "roasts":
            row.setdefault("visibility", "public")
        if table == "langsmith_connections":
            row.setdefault("status", "active")
            row.setdefault("last_sync_finished_at", None)
            row.setdefault("last_success_at", None)
            row.setdefault("last_scan_count", 0)
            row.setdefault("last_error", None)
        return row
