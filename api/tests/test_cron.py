from datetime import UTC, datetime

import pytest

from app.cron import normalize_sync_cron, sync_cron_matches


def test_sync_cron_accepts_presets_and_matches_due_time() -> None:
    assert normalize_sync_cron("*/30 * * * *") == "*/30 * * * *"
    assert sync_cron_matches("0 9 * * 1-5", datetime(2026, 7, 20, 9, 0, tzinfo=UTC))
    assert not sync_cron_matches("0 9 * * 1-5", datetime(2026, 7, 20, 9, 30, tzinfo=UTC))


def test_sync_cron_rejects_invalid_or_unreachable_minutes() -> None:
    for value in ("* * * * *", "15 * * * *", "0 9 * *", "0 9 * * mon"):
        with pytest.raises(ValueError):
            normalize_sync_cron(value)
