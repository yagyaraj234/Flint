"""Small, dependency-free cron validation for LangSmith sync schedules."""

from datetime import datetime

DEFAULT_SYNC_CRON = "0 * * * *"
_LIMITS = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 6))


def normalize_sync_cron(value: str) -> str:
    cron = " ".join(value.split())
    fields = cron.split(" ")
    if len(fields) != 5:
        raise ValueError("Enter a five-field cron expression.")
    values = [_field_values(field, *limits) for field, limits in zip(fields, _LIMITS, strict=True)]
    if not values[0] <= {0, 30}:
        raise ValueError("Custom schedules must run on :00 or :30 UTC.")
    return cron


def sync_cron_matches(cron: str, now: datetime) -> bool:
    minute, hour, day, month, weekday = (
        _field_values(field, *limits)
        for field, limits in zip(cron.split(), _LIMITS, strict=True)
    )
    if now.minute not in minute or now.hour not in hour or now.month not in month:
        return False
    day_matches = now.day in day
    weekday_matches = (now.weekday() + 1) % 7 in weekday
    day_any, weekday_any = len(day) == 31, len(weekday) == 7
    return day_matches and weekday_matches if day_any or weekday_any else day_matches or weekday_matches


def _field_values(field: str, low: int, high: int) -> set[int]:
    values: set[int] = set()
    for part in field.split(","):
        range_part, separator, step_part = part.partition("/")
        if separator and (not step_part.isdigit() or int(step_part) < 1):
            raise ValueError("Invalid cron expression.")
        step = int(step_part) if separator else 1
        if range_part == "*":
            start, end = low, high
        elif "-" in range_part:
            start_text, end_text = range_part.split("-", 1)
            if not start_text.isdigit() or not end_text.isdigit():
                raise ValueError("Invalid cron expression.")
            start, end = int(start_text), int(end_text)
        elif range_part.isdigit():
            start = end = int(range_part)
            if separator:
                raise ValueError("Invalid cron expression.")
        else:
            raise ValueError("Invalid cron expression.")
        if start < low or end > high or start > end:
            raise ValueError("Invalid cron expression.")
        values.update(range(start, end + 1, step))
    return values
