# Dodo Payments integration plan

## Goal

Freemium gating on top of the existing scan pipeline and LangSmith sync.
Free plan: a bounded number of scans per month, no LangSmith auto-sync. Pro
plan: a Dodo subscription that grants a bundled credit balance per billing
cycle, unlocks LangSmith hourly sync, and — once the bundled credits run
out — keeps working via Dodo's native overage billing (configured
bill-at-billing). The app never builds its own credit-pack purchase UI;
Dodo's meter + credit-entitlement + overage feature *is* the "credit-based
after the plan is over" mechanism the product needs.

## Non-goals

- No multiple paid tiers, no annual billing, no self-serve plan-change UI
  beyond upgrade/cancel (Dodo hosts the customer portal for that).
- No separate credit-pack purchase flow — overage billing covers it.
- No invoicing UI — Dodo hosts checkout and billing history.
- No live Dodo credentials in this pass; build and test against a mocked
  client. Live checkout/webhook verification is a documented manual
  follow-up once the user has a Dodo test-mode account.

## Architecture

```
browser -> TanStack Start server -> FastAPI -> Dodo Payments API
                                            \-> Supabase (subscriptions)
Dodo -> POST /billing/webhook (signature-verified) -> FastAPI -> Supabase
```

Mirrors the LangSmith integration shape: a network-touching module lives
under `api/app/billing/` (not `normalize/`/`analyze/`, which stay pure),
FastAPI owns the only Dodo API key, and the browser never sees it.

## Data model

Add to `api/schema.sql`:

```sql
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) unique,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'none'
    check (status in ('none', 'active', 'on_hold', 'cancelled', 'failed')),
  dodo_customer_id text,
  dodo_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
-- no policies: only the FastAPI service role reaches this table
```

Free-tier usage is **not** a new counter table — it's a count of the
user's existing `roasts` rows created this calendar month (ponytail: reuse
what's already there). Pro-tier usage/balance lives in Dodo; the app
queries it via the credit-entitlements balance endpoint for display, it
does not shadow-track it.

## Config (`api/.env` only, never frontend)

```dotenv
DODO_API_KEY=
DODO_ENVIRONMENT=test_mode
DODO_WEBHOOK_SECRET=
DODO_PRO_PRODUCT_ID=
FREE_TIER_MONTHLY_SCANS=5
```

## API surface

```
POST /billing/checkout                  auth required
  body: {}                               (Pro is the only paid product)
  200: { checkout_url: string }

GET  /billing/status                     auth required
  200: { plan: 'free'|'pro', status, scans_used_this_month?: int,
          scans_included?: int, credits_remaining?: number,
          current_period_end?: string }

POST /billing/webhook                    Dodo-signature verified, no internal token
  body: raw Dodo event payload
  200: {} always (ack fast), upserts `subscriptions` from
       subscription.active / .renewed / .on_hold / .failed / .cancelled /
       .updated events
```

`GET /billing/status` calls Dodo's `get-customer-balance` for pro users to
surface `credits_remaining`; free users get a scans-used/scans-included
pair computed from `roasts`.

## Contract change to the frozen PLAN.md ingest contract

`POST /ingest`, `POST /ingest/batch`, and LangSmith hourly sync gain a new
failure mode for authenticated requests once a free user is over quota:

```
402: { "detail": "free_tier_scan_limit", "scans_used": int, "scans_included": int }
```

Anonymous ingest (`source` without a bearer token) is unaffected — it stays
open per the existing contract. Pro users are never blocked; a scan always
runs and a Dodo usage event fires after success (`event_name: "roast.scan"`).
This is a new documented case, not a silent change — PLAN.md's API contract
section should get a short note pointing at this file.

## LangSmith tie-in

`POST /internal/jobs/langsmith-hourly` and manual `Scan now` skip connections
belonging to a `free`-plan user (mark them `paused` with a safe message
"Upgrade to Pro to enable automatic sync" instead of erroring). This is the
one place the two integrations touch; nothing else about the LangSmith
adapter/pipeline changes.

## Dodo client (`api/app/billing/dodo_client.py`)

Thin `httpx`-based wrapper (same dependency pattern as
`integrations/langsmith.py`), functions only, no global state:

- `create_checkout_session(user_id, email) -> checkout_url`
- `get_customer_balance(dodo_customer_id) -> credits_remaining`
- `ingest_usage_event(dodo_customer_id, event_name="roast.scan")`
- `verify_webhook_signature(payload_bytes, headers, secret) -> bool`

Add `dodopayments` (the official Python SDK) to `api/requirements.txt` —
explicitly authorized for this task, no need to ask again.

`api/app/billing/plans.py` stays pure: plan constants, quota math,
`scans_included_for(plan)`, no network, no FastAPI import — testable
without a server, same rule as `normalize/`/`analyze/`.

## Test plan (this pass — mocks only)

- `plans.py` quota math: free under/at/over limit, pro always allowed.
- Webhook signature verification: valid/invalid/missing signature.
- Webhook upsert: each event type transitions `subscriptions` correctly.
- `dodo_client` functions against a mocked `httpx` transport — no real
  network call in the suite.
- Ingest gating: free user over quota gets 402 with the documented body;
  free user under quota succeeds; pro user always succeeds and triggers a
  (mocked) usage-event call; anonymous ingest unaffected.
- LangSmith sync: free-plan connection is skipped/paused, pro-plan
  connection syncs normally.
- Frontend: billing page renders free vs pro state, upgrade button calls
  the server function and redirects to the returned `checkout_url` (mock
  the fetch), status badge in `app-shell`.

## Manual follow-up (human setup, deferred — not part of this pass)

1. Create a Dodo Payments account, get a test-mode API key.
2. Dashboard: create one recurring "Pro" product. Attach a credit
   entitlement (e.g. 200 credits/cycle) with a meter on `roast.scan`
   (Count aggregation, 1 unit = 1 credit). Set "Allow Overage" on, pick
   "Bill overage at billing" with a per-unit price.
3. Create a webhook endpoint pointing at `/billing/webhook`, copy the
   signing secret.
4. Fill `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PRO_PRODUCT_ID` into
   `api/.env`.
5. Run one real checkout in test mode, confirm the webhook lands and
   `subscriptions.status` flips to `active`, confirm `credits_remaining`
   decreases after a scan.

## Work split (3 tracks, isolated git worktrees, mirrors PLAN.md's pattern)

**Track P1 — foundation (lands first).** `api/schema.sql` subscriptions
table, `api/app/config.py` DODO_* settings, `api/app/billing/dodo_client.py`,
`api/app/billing/plans.py`, `api/app/routers/billing.py` (checkout/status/
webhook), `api/requirements.txt`, pytest with mocks.

**Track P2 — gating (depends on P1).** Wire quota check into
`api/app/routers/ingest.py` and batch ingest, emit usage events after a
successful pro scan, gate LangSmith hourly sync in `api/app/routers/jobs.py`
to pro-plan connections, PLAN.md contract note, pytest.

**Track P3 — frontend (depends on P1's contract, not P2).**
`src/routes/app.billing.tsx`, `src/lib/billing.functions.ts` server
function calling `POST /billing/checkout` and redirecting, plan/credits
status card, nav badge in `app-shell`, bun test.

Merge discipline: P1 merges to `feature/llm` first; P2 and P3 rebase on it
and can then run in parallel. One commit per stage, on the worktree
branches only — no push, no touching `main`.
