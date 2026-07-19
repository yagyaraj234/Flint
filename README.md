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

Supported secrets are redacted before raw or normalized trace data is stored.
PII findings are detection-only today; emails and phone numbers are not redacted.
Public report APIs exclude raw traces, owner data, batches, errors, and all
LangSmith-sourced reports.

## Run

Copy `api/.env.example` to `api/.env` and configure the backend values. The
Start server also needs `API_URL`, `SUPABASE_URL`, and either
`SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`; `INTERNAL_API_TOKEN` is
needed when using LangSmith connections.

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
