# Helix implementation contract

This is the current product and API contract. Change it before changing a
request or response shape.

## Product boundary

Helix assesses completed AI-agent traces. A Scan is one successfully completed
assessment; a Batch is a requested group of Scans; a Connection is an
operator-controlled LangSmith project relationship. Helix is post-run analysis,
not a runtime guardrail.

```
browser -> TanStack Start server -> FastAPI -> Supabase
                                  -> OpenAI (optional report generation)
                                  -> LangSmith / Dodo (server-only integrations)
```

FastAPI owns assessment, persistence, billing, LangSmith sync, and all secrets.
The Start server owns the UI and forwards authenticated requests. Browser code
uses Supabase only for auth; it never reads or writes `roasts`.

## Assessment and privacy

`api/app/assessment.py` performs parse -> redact -> deterministic analysis ->
score -> detailed report and never writes storage. `api/app/pipeline.py`
persists the resulting redacted assessment and its ownership/provenance.

The recursive redactor replaces supported OpenAI, AWS, GitHub, Slack, and
Google keys; JWTs; bearer tokens; and private-key headers before raw or
normalized trace data is stored. Email addresses and phone numbers are detected
as findings, not redacted. Optional OpenAI report generation receives only
redacted findings, cost data, and trace metadata; a deterministic fallback is
stored if no API key is configured or generation fails.

Public surfaces never return raw traces, owner identity, batch data, errors, or
LangSmith records. Public lists additionally exclude private reports.

## API contract

All FastAPI JSON uses `snake_case`. A Bearer token is a Supabase access token;
FastAPI validates it and derives the user ID. Request bodies never set the
effective owner.

### Scan ingestion

| Endpoint | Auth | Behavior |
| --- | --- | --- |
| `POST /ingest` | Optional | Accepts `{source, title?, format?, trace}` and returns `{slug}`. A signed-in user is admitted through entitlement checks; anonymous scans remain open. `langsmith` provenance is internal-only and forged provenance returns 403. Invalid traces return 422; exhausted free allowance returns 402. |
| `POST /ingest/batch` | Required | Accepts 1--25 traces. Every requested Scan must fit entitlement before work starts. Returns `{batch_id, results}`; malformed members are stored as redacted failed rows while valid members complete. |

`source` is one of `synthetic`, `upload`, `bfcl`, `gaia`, `live`, or
`langsmith`; external callers cannot submit the final value. `format` is
`openai-agents` or `generic`, or omitted for parser selection.

### Reports and sharing

| Endpoint | Auth | Behavior |
| --- | --- | --- |
| `GET /roasts/recent` | None | Ten newest completed, public, non-LangSmith report summaries. |
| `GET /roasts/{slug}` | Optional | Completed non-LangSmith report DTO. A private report is visible only to its owner or a signed-in recipient listed in `report_shares`. |
| `GET /me/roasts?batch_id=` | Required | Owner report rows, newest first. |
| `GET /me/roasts/{slug}/sharing` | Required | Owner visibility and recipient list. |
| `PUT /me/roasts/{slug}/visibility` | Required | Set `public` or `private`. |
| `POST /me/roasts/{slug}/shares` | Required | Add an email recipient. |
| `DELETE /me/roasts/{slug}/shares/{email}` | Required | Remove an email recipient. |

Public and owner report DTOs include findings, cost, detailed report, score,
tier, and status. Public reports also include the redacted normalized timeline.
Cost totals identify `measured`, `estimated`, or `mixed` token use; an
`unpriced_models` value means dollar figures exclude those models.

### Billing and connections

| Endpoint | Auth | Behavior |
| --- | --- | --- |
| `GET /billing/status` | Required | Free monthly Scan use or Pro credit balance. |
| `POST /billing/checkout` | Required | Creates a Dodo checkout session. |
| `POST /billing/webhook` | Dodo signature | Updates subscription state. |
| `/integrations/langsmith/*` | Internal Start-server headers | Creates, lists, updates, syncs, and removes the current user's LangSmith connections. API keys are encrypted server-side and never returned. |
| `POST /internal/jobs/langsmith-sync` | Cron secret | Flushes pending metering, pauses ineligible connections, and syncs eligible active connections whose five-field UTC cron is due. The worker invokes it every 30 minutes. |

LangSmith Connections use an API key, workspace, project, and user-selected five-field UTC sync cron. Completed traces
are fetched with bounded batches, overlap, a database lease, and idempotent
connection/trace provenance. Connections without Pro entitlement pause and
resume only through an explicit operator action. LangSmith reports never appear
on public report routes.

Completed signed-in Scans are the only billable event. Dodo metering failures
remain pending and are retried with their stable event ID; they never undo a
completed Scan.

## Data and migrations

`api/schema.sql` is the complete schema for a fresh Supabase project.
Timestamped upgrades live in `supabase/migrations/`. Service-role access is
server-only; RLS remains enabled with no browser policies for `roasts`,
connections, shares, subscriptions, and usage events.

## Environment and checks

Backend values belong in `api/.env`; start from `api/.env.example`. The Start
server needs `API_URL`, Supabase URL plus a publishable/anon key for auth, and
`INTERNAL_API_TOKEN` for LangSmith proxy calls. Never expose service-role,
OpenAI, Dodo, cron, or LangSmith credential values to the browser.

```bash
cd api && ./.venv/bin/python -m pytest -q
bun test
bun run check
bun run build
git diff --check
```
