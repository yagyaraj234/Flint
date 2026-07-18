# Flint API

FastAPI backend for Flint, security scanning for AI agent traces. Owns the whole
pipeline: normalize → redact → analyze → score → Supabase. Flint redacts
supported secrets before storage. See PLAN.md at the repo root for the contract
and stage plan.

## Endpoints

- `POST /ingest` — `{source, title?, format?, trace}` → `{slug}` (pipeline is STUBBED until stages 1–2 land; stores placeholders, never the raw trace)
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

## LangSmith hourly sync

The Cloudflare Worker triggers `POST /internal/jobs/langsmith-hourly` at the top
of every hour. Configure `API_URL` and `CRON_SECRET` as Worker secrets, and use
the same `CRON_SECRET` in the FastAPI environment. The API also requires
`INTERNAL_API_TOKEN` and `LANGSMITH_CREDENTIAL_KEY`; see `.env.example`.
