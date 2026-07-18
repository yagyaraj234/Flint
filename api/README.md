# Flint API

FastAPI backend for Flint, security scanning for AI agent traces. Owns the whole
pipeline: normalize → redact → analyze → score → Supabase. Flint redacts
supported secrets before storage. See PLAN.md at the repo root for the contract
and stage plan.

## Endpoints

- `POST /ingest` — `{source, title?, format?, trace}` → `{slug}`. Runs normalize → redact → deterministic checks → Luna assessment → Supabase.
- `GET /roasts/recent` — 10 newest `{slug, title, score, tier, created_at}`
- `GET /roasts/{slug}` — full row, 404 if missing
- `GET /health`

## Run

Requires Python 3.11+ (uses `X | None` annotations).

```
cd api
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase + OpenAI keys — empty values = 500s on DB routes
uvicorn app.main:app --reload --port 8000
```

## Test

```
pytest
```

Tests use a fake in-memory Supabase (tests/conftest.py), no network needed.

`OPENAI_API_KEY` is required for the `gpt-5.6-luna` detailed assessment. Without
it, ingest still stores a deterministic fallback report.
