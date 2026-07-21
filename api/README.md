# Helix API

FastAPI backend for Helix. It owns trace assessment, redacted persistence,
Supabase auth validation, report sharing, Dodo billing, and LangSmith sync.

With `HELIX_DEMO=true`, it uses an in-memory store and generic provider
responses instead. No network credentials are required; data resets when the
API process restarts.

## Run without Docker

Requires Python 3.11+.

```bash
cd api
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
./.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

The copied example runs locally in demo mode. Set `HELIX_DEMO=false` to require
real providers: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are then required
for database-backed routes. `OPENAI_API_KEY` remains optional; without it, the
deterministic fallback roast line and detailed report are persisted. Configure
Dodo values only for checkout/metering, and LangSmith/cron values only for
connections and scheduled sync. Never place frontend Supabase keys in this file.

## Endpoint groups

- `POST /ingest`, `POST /ingest/batch`: assess traces. Single ingest is
  anonymous or authenticated; batch ingest requires a Bearer token.
- `GET /roasts/recent`, `GET /roasts/{slug}`: public report reads subject to
  visibility and recipient checks.
- `/me/roasts*`: authenticated owner reads and visibility/share management.
- `/billing/status`, `/billing/checkout`: authenticated billing. `/billing/webhook`
  accepts only a verified Dodo webhook.
- `/integrations/langsmith*`: Start-server-only routes protected by
  `X-Internal-Api-Token` and `X-User-Id`; never call them from the browser.
- `POST /internal/jobs/langsmith-sync`: cron-only route protected by
  `X-Cron-Secret`.
- `GET /health`: `{ "status": "ok" }`.

Full request/response and privacy contract: [../PLAN.md](../PLAN.md).

## Test

```bash
cd api && ./.venv/bin/python -m pytest -q
```

Tests use an in-memory Supabase fake and do not need network credentials.
