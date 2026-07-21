# Helix

AI agent cost and risk scanner for completed traces.

Helix parses a trace, redacts supported credentials before storage, runs
deterministic security/reliability/cost checks, scores the result, and creates a
shareable report. It supports direct uploads, batches, and user-owned LangSmith
projects. It does not block agent actions at runtime.

## What it finds

- Duplicate model calls, repeated 2,000+ token prompt prefixes, and oversized context
- Repeated tool calls, failed tools without a later retry, slow spans, and error tails
- Supported API keys/tokens, plus emails, phone numbers, and insecure HTTP tool URLs

## Architecture

FastAPI owns assessment, Supabase, billing, LangSmith sync, and secrets.
TanStack Start owns the UI and server-side calls to FastAPI. The browser uses
Supabase only for authentication and never accesses the `roasts` table.

`HELIX_DEMO=true` swaps Supabase, Dodo, LangSmith, and OpenAI for local,
generic behavior. It is for evaluation only: sign-in accepts any valid email
and 8+ character password, data resets when the API restarts, no email is sent,
and no payment or provider request is made.

Supported secrets are redacted before raw or normalized trace data is stored.
PII findings are detection-only today; emails and phone numbers are not redacted.
Public report APIs exclude raw traces, owner data, batches, errors, and all
LangSmith-sourced reports.

## Run with Docker

Requires Docker Desktop (or Docker Engine with Compose). The default command
runs the complete no-key demo; no account, database, API key, or `.env` file is
needed.

```bash
docker compose up --build
```

Open `http://localhost:3000`. FastAPI health check: `http://localhost:8000/health`.
Sign up with any valid email and an 8+ character password, then upload a JSON
trace. The LangSmith form accepts any nonempty key and returns generic workspace
and project data; its **Scan now** action creates a generic local trace. Billing
uses a no-charge local checkout. Stop with `docker compose down`; starting again
resets demo data.

Verify the API demo after it is up:

```bash
docker compose exec api python scripts/verify_demo.py
```

### Real providers

Set `HELIX_DEMO=false`, copy both example environment files, and configure the
real provider values. Apply [`api/schema.sql`](api/schema.sql) to Supabase before
starting production-like services. Keep service-role, OpenAI, Dodo, cron, and
LangSmith credentials in `api/.env`; the Start server needs the matching
Supabase URL/publishable key and `INTERNAL_API_TOKEN` in `.env`.

## Run without Docker

Copy the example files to run locally. They default to no-key demo mode. Set
`HELIX_DEMO=false` and configure providers only when testing real integrations.

```bash
# terminal 1
cd api && ./.venv/bin/python -m uvicorn app.main:app --reload --port 8000

# terminal 2
bun dev
```

## Verify

```bash
cd api && ./.venv/bin/python -m pytest -q
cd .. && bun test && bun run check && bun run build
git diff --check
```

See [PLAN.md](PLAN.md) for the frozen API, privacy, billing, sharing, and
LangSmith contracts. See [api/README.md](api/README.md) for backend setup and
endpoint details.
