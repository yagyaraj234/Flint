# Helix

AI-agent trace assessment tool. Read `PLAN.md` before changing its frozen request/response contract.

Architecture:

- FastAPI (`api/`) owns trace assessment, Supabase access, payment rules, LangSmith sync, and every secret.
- `api/app/assessment.py` owns parse → redact → analyze → score → detailed report. It returns a redacted assessment and never writes storage.
- `api/app/pipeline.py` owns assessment persistence, ownership, and provenance. Failed batch rows remain redacted.
- `api/app/billing/entitlements.py` owns Scan admission, Connection eligibility, and retryable Dodo metering. A completed Scan is the only billable outcome; Dodo failures stay pending and never fail a completed Scan.
- `api/app/integrations/langsmith.py` owns the concrete LangSmith adapter plus `LangSmithConnections` lifecycle/sync module. Connections pause without Pro entitlement and resume only through an explicit user action.
- TanStack Start (`src/`) server-fetches data from FastAPI at `API_URL`. It may use Supabase only for auth and file storage, never the `roasts` table. LangSmith server functions additionally use `INTERNAL_API_TOKEN`; browser code never sees it.

Domain terms (`CONTEXT.md`):

- Scan: one successfully completed trace assessment.
- Batch: all requested Scans must fit entitlement before it starts.
- Connection: an operator-controlled LangSmith project relationship.

Commands:

- backend: `cd api && ./.venv/bin/python -m uvicorn app.main:app --reload --port 8000`
- backend tests: `cd api && ./.venv/bin/python -m pytest -q`
- frontend dev: `bun dev`
- frontend tests: `bun test`
- frontend checks: `bun run check && bun run build`

Rules:

- Backend: Python 3.11+, Pydantic request/response models, type hints everywhere. Frontend: strict TypeScript, no `any`.
- `api/app/normalize/` and `api/app/analyze/` remain pure: no FastAPI, Supabase, or network imports.
- Secrets stay server-only in `api/.env`; never log, return, or expose them. The Start server also needs `API_URL`, Supabase URL/publishable auth key, and (for LangSmith) `INTERNAL_API_TOKEN`; only the publishable auth key may reach browser code.
- Keep field names snake_case through FastAPI. Public roast reads must exclude raw trace, owner identity, batch data, errors, and LangSmith rows.
- Do not add dependencies without approval. Preserve Dodo's stable event id when retrying metering.
- Schema changes need both `api/schema.sql` and a timestamped `supabase/migrations/` file.
- Run relevant backend and frontend gates plus `git diff --check` before committing.
- Every commit created or amended by Codex must append `Co-authored-by: Codex <codex@openai.com>` to its commit message.
