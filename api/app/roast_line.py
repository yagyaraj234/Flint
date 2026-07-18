"""Roast line generation. Fired via BackgroundTasks after insert — the card
never blocks on this. Rows are inserted with a per-tier fallback line, so the
card always has something; the LLM line replaces it when (and only when) the
call succeeds."""

import json
from typing import Any

from openai import OpenAI

from app.config import get_settings
from app.db import get_supabase

FALLBACK_LINES: dict[str, str] = {
    "Rare": "Annoyingly competent. We checked twice.",
    "Medium": "Works fine, leaks a little pride per run.",
    "Well Done": "This agent bills like a lawyer and loops like a screensaver.",
    "Charcoal": "This trace should be read to new hires as a cautionary tale.",
}

_PROMPT = (
    "You write one-line roasts of AI agent traces for a scorecard. "
    "Given findings JSON and a health score (0-100), reply with ONE savage but "
    "technical roast line, under 120 characters, no profanity, no emoji, no quotes. "
    "Reference the worst finding specifically."
)


def fallback_line(tier: str) -> str:
    return FALLBACK_LINES.get(tier, FALLBACK_LINES["Well Done"])


def generate_roast_line(findings: list[dict[str, Any]], score: int, tier: str) -> str | None:
    """One OpenAI call; None on any failure (caller keeps the fallback)."""
    settings = get_settings()
    if not settings.openai_api_key:
        return None
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.roast_model,
            messages=[
                {"role": "system", "content": _PROMPT},
                {
                    "role": "user",
                    "content": json.dumps({"score": score, "tier": tier, "findings": findings}),
                },
            ],
            max_completion_tokens=120,
        )
        line = (response.choices[0].message.content or "").strip().strip('"')
        return line[:120] if line else None
    except Exception:
        return None


def update_roast_line(slug: str) -> None:
    """Background task: read the stored row, generate, update. Never raises."""
    try:
        db = get_supabase()
        result = db.table("roasts").select("findings,score,tier").eq("slug", slug).limit(1).execute()
        if not result.data:
            return
        row = result.data[0]
        line = generate_roast_line(row["findings"], row["score"], row["tier"])
        if line:
            db.table("roasts").update({"roast_line": line}).eq("slug", slug).execute()
    except Exception:
        return
