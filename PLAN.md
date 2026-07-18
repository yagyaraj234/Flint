# Roast0: build plan (v2 — FastAPI backend)

TanStack Start (UI only) + FastAPI (backend) + Supabase. 5 hours. One repo, one table, one demo.

Working name is Roast0. Do not spend hackathon time renaming it. You can bikeshed the name after you win.

How to use this file: it lives at the repo root as PLAN.md, CLAUDE.md/AGENTS.md point at it. Tell your agent "execute stage N" — one stage per prompt, check the acceptance line before moving on. Don't dump all stages in one go, agents drift when you do that.

**v2 pivot (decided at stage 0):** the whole pipeline — normalize, redact, analyze, score, store — lives in Python under `api/`, not in `src/lib/`. Reason: Python-side tech support is available for analysis tooling (Ragas etc.). The TanStack Start app is now frontend only. `src/lib/db.server.ts` gets deleted in stage 3; the frontend never touches Supabase.

---

## What we're building

Paste or auto-capture an AI agent trace, get back a shareable roast card: a health score (0 to 100), a roast tier (Rare, Medium, Well Done, Charcoal), a cost-waste breakdown in dollars, and a flag list covering security (leaked keys, PII), reliability (tool-call loops, error tails), and cost (duplicate LLM calls, repeated bloated prompts). Every card lives at a public URL built to be posted.

The pipeline (all in FastAPI): trace JSON in, normalize to one internal schema, redact secrets, run 2 analyzers, score, store in Supabase, render card in the Start app.

---

## Architecture

```
browser ──► TanStack Start server (bun, :3000) ──► FastAPI (uvicorn, :8000) ──► Supabase
```

- FastAPI owns all logic and all secrets. It is the only process holding `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`.
- The Start app server-fetches from FastAPI (`API_URL=http://localhost:8000`). Server-side fetch keeps SSR working for the stage 6 OG tags.
- The browser talks only to the Start server. One data path, no CORS debugging, no RLS debugging.

## API contract (frozen — all three tracks build against this)

Field names are snake_case everywhere, including JSON payloads. The UI adapts; nobody converts casing mid-pipeline.

```
POST /ingest
  body: { "source": "synthetic"|"upload"|"bfcl"|"gaia"|"live",
          "title": string?, "format": "openai-agents"|"generic"?, "trace": <any JSON> }
  200:  { "slug": string }

GET /roasts/{slug}
  200: the full roasts row (see data model) | 404

GET /roasts/recent
  200: [ { "slug", "title", "score", "tier", "created_at" } ]  // 10 newest
```

A checked-in example response lives at `fixtures/contract/roast-row.json` (created in stage 1). The UI track builds the card against that file and swaps in the live fetch later. If the contract must change, it changes here first and gets announced out loud.

---

## Ground rules (all agents, all humans)

1. Backend: Python 3.11+, pydantic models for every payload, type hints on every function. Frontend: strict TS, no `any`.
2. Everything in `api/app/normalize/` and `api/app/analyze/` is pure functions. Zero FastAPI imports, zero Supabase imports, zero network. Data in, data out — so tracks can build in isolation and `pytest` covers them without a server.
3. Finish the acceptance check before starting the next stage. Commit per stage with the given message.
4. Dependency lists are fixed. Backend (`api/requirements.txt`): `fastapi`, `uvicorn`, `supabase`, `pydantic`, `pydantic-settings`, `openai`, `openai-agents`, `pytest`, `httpx`. `ragas` may be added in stage 7 only. Frontend: what's already in package.json; remove `@openai/agents` and `openai` from it in stage 3 (backend owns those jobs now). Ask before adding anything else.
5. `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` exist only in `api/.env`. Never logged, never returned in a response, never known to the frontend. The frontend's only env value is `API_URL`.
6. No styling work before stage 6. An ugly card that renders beats a pretty card that doesn't exist.
7. All database access goes through FastAPI. The Start app never imports a Supabase client. One data path.

---

## Work split — 3 people, parallel agents

Three tracks with one interface between them (the API contract above + `types.py`). Each person works on their own branch or git worktree and spawns agents freely inside their track; the pure-module rule is what makes agent fan-out safe.

**Track A — Pipeline (stages 1–2).** Owns `api/app/types.py`, `api/app/normalize/`, `api/app/analyze/`, fixtures, pytest. `types.py` is written first and frozen; after that, fan out agents: one on redaction, one per parser, one on fixtures, then one per analyzer file in stage 2. Everything here is pure and test-covered, so agents can run without stepping on each other.

**Track B — API + data (stages 3, 5).** Owns `api/app/pipeline.py`, `api/app/routers/`, `api/app/db.py`, `api/scripts/`. Starts immediately on the ingest/read endpoints with a stubbed pipeline (echo a canned row), swaps the real pipeline in when Track A lands. Then stage 5: fan out one agent per synthetic agent script + one for the BFCL converter + one for the seed script. Owns demo rehearsal.

**Track C — UI (stages 3-UI, 4, 6).** Owns everything in `src/`. Builds the paste page and the card page against `fixtures/contract/roast-row.json` from minute one — no waiting on the backend. Wires the real `API_URL` fetches when Track B's endpoints respond. Stage 6 styling, OG tags, copy-roast button. No styling before stage 6 still applies.

Merge discipline: Track A merges to main at end of stage 1 and stage 2; B and C rebase on it. File ownership is exclusive per track — if you need a change in another track's file, ask that person, don't edit it. The only shared files are this PLAN.md and the contract fixture, both owned by whoever Track A is.

Integration checkpoints (whole team, 5 minutes each):
- **T+1:15** — Track A stage 1 merged; Track B swaps stub for real normalize+redact.
- **T+2:10** — Track A stage 2 merged; full pipeline live; Track C swaps fixture for live fetch.
- **T+3:30** — first end-to-end run of a stage 5 agent script → card in browser. Everything after this is polish.

---

## Human setup (10 minutes, before agents touch anything)

1. Supabase project exists (stage 0 done). Schema SQL below already run.
2. `api/.env` filled from `api/.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ROAST_MODEL`. Root `.env` for the frontend gets only `API_URL`.
3. Check which models the hackathon OpenAI credits cover, write the model name down for `ROAST_MODEL`.
4. Open the OpenAI pricing page and fill the numbers into `pricing.py` when stage 2 creates it. Do not let anyone hardcode prices from memory.

Run commands: `cd api && uvicorn app.main:app --reload --port 8000` (backend), `bun dev` (frontend), `cd api && pytest` (tests).

---

## Data model

One table. No joins. (Already created in Supabase during stage 0.)

```sql
create table roasts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  source text not null check (source in ('synthetic','upload','bfcl','gaia','live')),
  raw_trace jsonb not null,
  normalized jsonb not null,
  findings jsonb not null,
  cost jsonb not null,
  score int not null,
  tier text not null,
  roast_line text,
  created_at timestamptz default now()
);

create index roasts_slug_idx on roasts (slug);
alter table roasts enable row level security;
-- no policies: service role bypasses RLS, and service role is the only client we use
```

`raw_trace` and `normalized` are stored post-redaction. The database never contains a secret, even one a user uploaded. That line goes in the pitch.

---

## Internal types

These go in `api/app/types.py` in stage 1 and nothing downstream gets to reinterpret them. Track A writes this file first; it is frozen once stage 1 starts.

```python
from typing import Any, Literal
from pydantic import BaseModel

SpanType = Literal['llm', 'tool', 'handoff', 'guardrail', 'other']
TokenSource = Literal['measured', 'estimated']
Category = Literal['security', 'reliability', 'cost']

class Span(BaseModel):
    id: str
    parent_id: str | None
    type: SpanType
    name: str                      # tool name, model name, agent name
    model: str | None              # for llm spans, needed for pricing
    start_ms: float | None
    duration_ms: float | None
    tokens_in: int | None
    tokens_out: int | None
    token_source: TokenSource | None
    input: str                     # stringified, post-redaction
    output: str                    # stringified, post-redaction
    meta: dict[str, Any]

class NormalizedTrace(BaseModel):
    trace_id: str
    workflow: str
    spans: list[Span]

class Finding(BaseModel):
    rule: str
    category: Category
    severity: Literal[1, 2, 3]
    span_ids: list[str]
    message: str                   # plain language, shown on the card
    est_waste_usd: float | None = None

class CostReport(BaseModel):
    total_tokens_in: int
    total_tokens_out: int
    total_usd: float
    waste_usd: float
    token_source: Literal['measured', 'estimated', 'mixed']
    monthly_projection_usd: float  # waste_usd * RUNS_PER_DAY * 30
    projection_assumption: str     # printed on the card, e.g. "at 1,000 runs/day"
```

`token_source` matters. Traces captured from the SDK carry real usage numbers, so they're `measured`. Uploaded or public traces without usage get a chars/4 estimate and are labeled `estimated` on the card. The card always says which one it's showing. Judges with API experience will ask where the dollar figure came from, and "measured from span usage, estimated and labeled when usage is absent" is the answer that survives the question.

---

## Stage 0: scaffold and plumbing — DONE

Start app scaffolded, FastAPI scaffolded under `api/` (health route, Supabase client, `GET /roasts/{slug}` already exist), Supabase table created, CLAUDE.md written. Commit `e38d3be`.

Leftover from the pivot, fold into stage 3: delete `src/lib/db.server.ts`, drop `@openai/agents` + `openai` from package.json, move OpenAI/Supabase keys out of root `.env` into `api/.env`.

---

## Stage 1: types, redaction, normalizer (Track A, target T+1:10)

This is the riskiest hour of the build. If the normalizer is wrong, every later stage is built on sand.

Files:

```
api/app/types.py                       # pydantic models above — write and freeze FIRST
api/app/normalize/__init__.py
api/app/normalize/estimate_tokens.py   # ceil(chars / 4), labeled 'estimated'
api/app/normalize/redact.py
api/app/normalize/openai_agents.py     # parser 1
api/app/normalize/generic.py           # parser 2
fixtures/leaked-key.json
fixtures/loopy.json
fixtures/bloated-prompt.json
fixtures/clean.json
fixtures/contract/roast-row.json       # hand-written example row for Track C
api/tests/test_redact.py
api/tests/test_openai_agents.py
api/tests/test_generic.py
```

Agent fan-out: after `types.py` lands — one agent on redact, one per parser, one on fixtures. They share only `types.py`.

Redaction spec (`redact.py`): walk every string field in a trace, replace any match with `«REDACTED:rule»`. Findings later reference the rule and span id, never the matched value. Starting pattern set:

```python
SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ('openai-key',   re.compile(r'sk-[A-Za-z0-9_-]{20,}')),
    ('aws-key',      re.compile(r'AKIA[0-9A-Z]{16}')),
    ('github-token', re.compile(r'gh[pousr]_[A-Za-z0-9]{36,}')),
    ('slack-token',  re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}')),
    ('google-key',   re.compile(r'AIza[0-9A-Za-z_-]{35}')),
    ('jwt',          re.compile(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')),
    ('private-key',  re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
    ('bearer',       re.compile(r'Bearer\s+[A-Za-z0-9._-]{20,}')),
]
```

Redaction returns both the cleaned trace and the list of `{rule, span_id}` hits, because the roast analyzer consumes those hits as security findings. Detection and redaction are the same pass.

Parser 1, `openai_agents.py`: consumes the export shape of the OpenAI Agents SDK (a trace object with a spans array: generation/response spans, function/tool spans, handoffs, guardrails, with usage on generation spans). Field names differ slightly between SDK versions, so write it defensively: `.get()` everywhere, unknown span types map to `'other'` with the raw payload dumped into `meta`, missing usage means `tokens_in/out = None`. In stage 5 you'll capture a real export from the Python `openai-agents` SDK and correct any field-name guesses against it. Build the fixtures in this SDK export shape so the test covers parser plus analyzer end to end.

Parser 2, `generic.py`: best-effort mapping for arbitrary JSON. Find arrays of objects carrying a name/type field plus something prompt-shaped (input, prompt, messages, args). Map what's recognizable, shove the rest into `meta`, estimate tokens. This parser exists so the demo line "paste any trace JSON" is true, and so the BFCL conversion in stage 5 has somewhere to land.

Fixture content:

- `leaked-key.json`: 3 spans, one tool span with a fake key in its args. Use an obviously fake value like `sk-FAKE000000000000000000000000` so nobody at the venue panics.
- `loopy.json`: the same tool called 6 times with identical args.
- `bloated-prompt.json`: 4 llm spans sharing an identical 2,500-token system prefix.
- `clean.json`: 3 sensible spans, real-looking usage numbers, nothing wrong.

Acceptance: `pytest` green. Each fixture normalizes through parser 1, a hand-written generic blob normalizes through parser 2, and the leaked-key fixture comes out with zero raw key material anywhere in the normalized output.

Commit: `stage 1: types, redaction, normalizers, fixtures`

---

## Stage 2: analyzers and scoring (Track A, target T+2:00)

Files:

```
api/app/analyze/__init__.py
api/app/analyze/pricing.py
api/app/analyze/cost.py
api/app/analyze/roast.py
api/app/analyze/score.py
api/tests/test_cost.py
api/tests/test_roast.py
api/tests/test_score.py
```

`pricing.py`:

```python
# Fill from the OpenAI pricing page AT THE VENUE. Zeros are intentional:
# the build should nag you until real numbers go in.
PRICING: dict[str, dict[str, float]] = {
    # 'model-name': {'in_per_m': 0, 'out_per_m': 0},
}
FALLBACK_PRICE = {'in_per_m': 0.0, 'out_per_m': 0.0}
RUNS_PER_DAY = 1000  # printed on the card as the projection assumption
```

Cost rules (`cost.py`), 3 rules only, resist adding more:

1. `duplicate-llm-call`: 2 or more llm spans with identical trimmed input. Severity 2. Waste = duplicated spans' token cost.
2. `repeated-bloat`: an identical prefix of 2,000+ estimated tokens appearing across 3 or more llm spans. Severity 2. Waste = prefix tokens × (occurrences − 1) × input price.
3. `context-stuffing`: any single llm span with tokens_in over 20,000. Severity 1. No waste number, just the flag.

Roast rules (`roast.py`):

1. `leaked-secret`: consumes the redaction hits from stage 1. Severity 3, category security. This is the headline rule, weight it accordingly.
2. `pii-in-prompt`: email or phone regex in span input. Severity 1, security.
3. `insecure-url`: `http://` (excluding localhost) inside tool args. Severity 1, security.
4. `tool-loop`: same tool name + identical args hash appearing over 3 times, severity 2; over 8 times, severity 3. Category reliability.
5. `error-tail`: trace's final span carries an error status in meta. Severity 2, reliability.

Scoring (`score.py`): start at 100. Deduct 5 per severity-1, 12 per severity-2, 25 per severity-3. Security findings multiply their deduction by 1.5, rounded. Floor at 0. Tiers: 90+ Rare, 65 to 89 Medium, 35 to 64 Well Done, below 35 Charcoal.

Acceptance: tests assert `leaked-key.json` lands in Charcoal with a `leaked-secret` finding, `loopy.json` produces `tool-loop`, `bloated-prompt.json` produces `repeated-bloat` with a nonzero `est_waste_usd`, and `clean.json` scores 90+.

Commit: `stage 2: cost and roast analyzers, scoring, tests green`

---

## Stage 3: ingest pipeline and upload UI (Track B backend + Track C frontend, target T+2:40)

Files:

```
api/app/pipeline.py            # normalize -> redact -> analyze -> score -> insert, returns slug
api/app/routers/ingest.py      # POST /ingest per the contract
api/app/routers/roasts.py      # extend: GET /roasts/recent (GET /roasts/{slug} exists)
src/routes/index.tsx           # textarea paste + file upload + recent roasts list
src/lib/api.ts                 # typed server-side fetch helpers against API_URL
```

Pipeline detail: try the openai_agents parser first, fall back to generic if it raises or yields zero spans, unless the request pins a `format`. Slug: 8 chars from `secrets.token_urlsafe` (no nanoid dependency in Python). Insert the row, return `{slug}`.

Track B starts before Track A merges by stubbing the pipeline (return a canned row) so the routes and DB insert are proven early. The ingest route is a plain JSON POST because stage 5's agent scripts and curl both need to hit it without a browser.

Track C's paste box calls a Start server function that forwards to `POST /ingest` and redirects to `/r/{slug}` on success. Use whatever server-function convention the installed Start version ships. If it fights you for more than 15 minutes, do the dumbest thing that works and move on. This is exactly the kind of hole a hackathon build dies in.

Pivot cleanup in this stage (Track C): delete `src/lib/db.server.ts`, remove `@openai/agents` and `openai` from package.json, root `.env` keeps only `API_URL`.

Acceptance: paste `leaked-key.json` into the browser textarea, land on `/r/{slug}` (a raw JSON dump of the row is fine at this stage), and confirm the stored row in Supabase has redacted content.

Commit: `stage 3: ingest endpoint, pipeline, paste UI`

---

## Stage 4: the roast card (Track C, target T+3:20 — start earlier against the contract fixture)

Files:

```
src/routes/r/$slug.tsx
```

The card is the product. It shows, top to bottom: title and source badge, the score as a big number with the tier label, the roast line (placeholder text until stage 6), top 3 findings in plain language with severity and category tags, the cost block (total spend, waste, `measured` or `estimated` label, monthly projection with the printed assumption string), and a collapsed span timeline (a simple ordered list with type, name, tokens, duration, no visualization library).

Home page (`index.tsx` from stage 3) lists the 10 most recent roasts via `GET /roasts/recent`, linking to their cards.

Server-render the card route (server-side fetch of `GET /roasts/{slug}`) so stage 6's OG tags actually work. No client-side data fetching for the card.

Track C builds this against `fixtures/contract/roast-row.json` from the start of the hackathon and swaps in the live fetch at the T+2:10 checkpoint.

Acceptance: every fixture ingested so far renders a readable card. A stranger can look at the leaked-key card for 5 seconds and say what went wrong.

Commit: `stage 4: roast card page, home list`

---

## Stage 5: synthetic agents, live capture, public data (Track B, target T+4:10)

Files:

```
api/scripts/agents/loopy.py    # calls the same fake weather tool 6 times
api/scripts/agents/leaky.py    # passes the fake key through a tool arg
api/scripts/agents/bloaty.py   # 10KB system prompt, 6 trivial sequential calls
api/scripts/agents/chatty.py   # asks the model to re-summarize its own summary 5 times
api/scripts/agents/clean.py    # baseline, does one thing sensibly
api/scripts/convert_bfcl.py    # BFCL entry -> generic trace JSON
api/scripts/seed.py            # runs the converter + posts all fixtures to /ingest
```

Each agent script builds a small agent with the Python `openai-agents` SDK, runs it, exports the trace (custom `TracingProcessor` that collects spans), and POSTs it to `http://localhost:8000/ingest` with `source: 'live'`. Time-box the processor fight to 20 minutes: if the API resists, have the script dump the trace to `fixtures/generated/*.json` instead and upload by hand. The demo survives either way.

While a real export is in hand, diff it against parser 1's assumptions from stage 1 and fix any field-name guesses. This is the moment the normalizer stops being speculative.

BFCL: pull a handful of entries from the Berkeley Function-Calling Leaderboard dataset (`https://huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard`, raw JSON also sits in the gorilla GitHub repo, which is faster than authenticating with HF). Convert question plus expected tool calls into a generic trace, tokens estimated. Be honest about what this is: BFCL entries are task definitions, mostly clean, no usage data. Their job in the demo is proving the parser handles a published external format, and that's the exact sentence to say on stage. GAIA needs a Hugging Face account and terms acceptance, so it's stage 7 stretch, skip it unless someone's already logged in.

Agent fan-out: one agent per script file; they're independent.

Acceptance: `python api/scripts/agents/leaky.py` produces a Charcoal card end to end with no manual steps, and one BFCL-derived card exists with the `estimated` label visible.

Commit: `stage 5: synthetic agents, live ingest, bfcl converter, seed`

---

## Stage 6: roast line, share affordances, styling (Track C + Track B, target T+4:40)

Files:

```
api/app/roast_line.py          # OpenAI call, fired via FastAPI BackgroundTasks
```

Roast line (Track B): one OpenAI call using `ROAST_MODEL`, fed the findings JSON and score, asked for a single savage-but-technical line under 120 characters, no profanity. Fire it via `BackgroundTasks` after the row insert and update the row when it lands. The card must never block on this call. Hardcode 4 fallback lines, one per tier, used when the call fails or hasn't landed yet.

Share affordances (Track C): a "copy roast" button on the card (roast line + score + URL, pre-formatted for a tweet), and OG meta tags on the card route (title = roast line, description = score, tier, and waste figure) so the URL unfurls when posted.

Styling pass (Track C): 30 minutes max, tier colors, big score, dark card, done. Pull in 2 or 3 shadcn components if that's faster than hand-rolling, and stop there.

Acceptance: card unfurl preview looks right in a checker, copy button output pastes clean into a tweet draft.

Commit: `stage 6: roast line, share button, og tags, styling`

---

## Stage 7: rehearsal and stretch (everyone, T+4:40 to T+5:00)

Rehearsal is mandatory, stretch is optional. Run the 3 demo beats below twice, end to end, from a clean terminal.

Stretch, only if the rehearsal was boring because everything worked — pick at most one:

- **Ragas quality analyzer** (the reason we went Python): a new `quality` category analyzer in `api/app/analyze/quality.py`. Extract llm spans' input/output pairs, run Ragas metrics (faithfulness / answer relevancy), emit `low-faithfulness` findings, severity 1–2. It makes LLM calls, so it runs like the roast line: async after insert, updates the row, never blocks ingest or the card. Add `ragas` to requirements only when this starts. This is a demo bonus line ("we also run LLM-judge quality metrics"), not core — the regex/structure analyzers are what make the demo deterministic.
- A public URL via a cloudflared quick tunnel so judges can open cards on their phones.
- A GAIA sample if someone has HF access.

---

## Cut lines

Decide by the clock, and cut without a meeting.

- Behind at 2:00: drop the generic parser and BFCL. SDK format only. The pitch loses the public-data line and keeps everything else.
- Behind at 3:20: drop live POST from agent scripts. They write JSON to `fixtures/generated/` and you upload through the paste box on stage. Nobody in the audience can tell the difference.
- Behind at 4:10: drop the LLM roast line. Hardcoded tier lines ship. They should be funny anyway, write them like they're the only ones that exist.
- Ragas is cut first, always, before any of the above. It's stretch.
- Never cut: redaction, the card page, the analyzer tests. Those 3 are the product, the demo, and the proof it works.

---

## Trace data sources, final word

1. Your own synthetic agents (stage 5). Primary source. You control the failures, so the demo has guaranteed findings instead of hoped-for ones.
2. BFCL (`https://huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard`). Parser legitimacy. Task definitions, mostly clean, tokens estimated and labeled.
3. GAIA (`https://huggingface.co/datasets/gaia-benchmark/GAIA`). Same role as BFCL, gated behind HF terms, stretch only.

The pitch sentence that ties it together: "We generated adversarial traces to guarantee real findings, and validated the parser on published benchmark data to prove it's more than a toy for our own test cases."

---

## Demo script, 3 beats, 90 seconds

1. Live terminal: `python api/scripts/agents/leaky.py`. The card appears: Charcoal, a leaked-secret finding, and the key visibly redacted in the stored trace. Say the line: "it caught the key, and it refused to store it. The roast tool doesn't keep what it catches."
2. Paste a BFCL-derived trace in the browser. Card renders with the `estimated` label. Say: "works on published benchmark formats, and it tells you when a number is measured versus estimated."
3. Hit copy roast, show the tweet-ready text and the unfurl. That's the virality surface, let it sit on screen for the last 5 seconds.
