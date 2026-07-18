# Flint

Security scanning for AI agent traces.

Flint scans agent traces for leaked secrets, unsafe tool calls, loops, failures,
and cost waste. It redacts supported secrets before storing a trace, then returns
a report with findings, a Flint score, and a shareable roast card.

## What Flint catches

- OpenAI, AWS, GitHub, Slack, and Google API keys in trace data
- JWTs, bearer tokens, private keys, emails, and phone numbers
- Plain-http tool URLs, repeated tool calls, and error tails
- Duplicate LLM calls, repeated prompt bloat, and oversized context

## Run

```bash
# terminal 1
cd api && uvicorn app.main:app --reload --port 8000

# terminal 2
bun dev
```

The FastAPI backend owns normalize, redact, analyze, score, and Supabase
storage — it is the only process holding the Supabase service-role key, and
all `roasts` reads and writes go through it. The TanStack Start frontend uses
Supabase directly for auth only (publishable key); its server functions
forward the session's access token to FastAPI, which validates it and derives
the user. Public report reads return a minimal card DTO — never the raw trace.

Endpoints: `POST /ingest` (token optional), `POST /ingest/batch` (token
required), `GET /roasts/{slug}` and `GET /roasts/recent` (public card DTOs),
`GET /me/roasts?batch_id=` (owner reads). Full contract in PLAN.md.

Frontend env is `API_URL` plus the Supabase URL/publishable key for auth.
Server secrets live only in `api/.env`.

## Verify (mandatory before any PR)

```bash
bun run check
bun run test
bun run build
cd api && pytest
```

`api/tests/test_contract_e2e.py` locks the privacy boundary end to end:
fixture in through `/ingest`, public read carries no secrets or private
fields, owner read requires the token.

Internal `roasts` table, API routes, and field names stay stable during the
hackathon. The roast language belongs only to share cards.
