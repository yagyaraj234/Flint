# Roast0
Agent trace roast tool. Hackathon build. Read PLAN.md, execute one stage at a time.

Architecture: FastAPI backend (`api/`) owns the whole pipeline (normalize → redact → analyze → score → Supabase). TanStack Start (`src/`) is frontend only — it server-fetches from FastAPI at `API_URL`, never touches Supabase.

Commands:
- backend: `cd api && uvicorn app.main:app --reload --port 8000`, tests: `cd api && pytest`
- frontend: `bun dev`

Rules:
- backend: Python 3.11+, pydantic models, type hints everywhere; frontend: strict TS, no `any`
- `api/app/normalize/` and `api/app/analyze/` are pure: no fastapi, no supabase, no network imports
- API contract in PLAN.md is frozen; snake_case field names everywhere
- acceptance check green before next stage, one commit per stage
- deps are fixed per PLAN.md, ask before adding (`ragas` allowed in stage 7 only)
- secrets live only in `api/.env`, server-only, never logged, never client-exposed; frontend env is only `API_URL`
- 3-track work split in PLAN.md: exclusive file ownership per track, don't edit another track's files
- no styling before stage 6
