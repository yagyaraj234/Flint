# New Features & Optimization Plan — Next Release

Status: proposed. Source: full codebase audit (backend, frontend, plans-vs-shipped) on 2026-07-19.

---

## Release backlog (from codebase audit)

### P0 — revenue + abuse holes (bugs in money paths, ship first)
1. **Anonymous ingest bypasses quota** — `api/app/routers/ingest.py:72`: no user → unlimited free scans, each triggers paid OpenAI call. Fix: quota by IP or require auth.
2. **No rate limiting anywhere** — public `/ingest`, `/roasts/*` unthrottled (add slowapi or proxy-level limits).
3. **Credit balance never enforced** — `api/app/routers/billing.py:127`: Pro user at 0 credits keeps scanning.
4. **Usage-event double billing** — `api/app/billing/dodo_client.py:139` fresh `uuid4` per call defeats idempotency; retries double-bill. Also isolate Dodo failure from ingest response (`ingest.py:80-98` 500s after roast stored).
5. **Two divergent monthly-scan counters** — `billing.py:114` vs `ingest.py:33` (one O(all-rows)). Unify one helper.
6. **Webhook replay guard** — only 5-min timestamp window (`billing.py:176-206`); add event-id idempotency.
7. **Live Dodo verification** — payments tested against mocks only; run real checkout → webhook → `subscriptions.status=active` before release (PAYMENTS-PLAN.md deferred item).

### P1 — user-facing gaps
1. **Subscription management** — Pro users have no cancel / portal / buy-credits (`src/routes/app.billing.tsx:79-91`); checkout has no success/return route (`src/lib/billing.functions.ts:40-54`).
2. **Scan-limit gating in UI** — `src/routes/app.new.tsx` never checks `scans_used_this_month` vs limit; over-cap free users get raw error instead of upgrade prompt. Direct conversion lever.
3. **Report privacy** — covered by Feature 1 above (visibility + shares).
4. **More trace formats** — only `openai-agents` + `generic`; add LangFuse or OTLP connector ("Integrations" page has one item; landing promises OpenAI Agents live ingest with no dedicated connector).
5. **Pagination** — roasts table unbounded; `src/lib/roast-functions.ts:23` hardcodes slice(0,10) for recent.

### P2 — reliability + hygiene
1. **Zero logging in backend** — Luna/Dodo/LangSmith failures silently swallowed (`roast_line.py:125`, `integrations/langsmith.py:461`). Add structured logging; add timeout to OpenAI client (`roast_line.py:88` has none).
2. **Batch ingest synchronous** — 25 traces × OpenAI calls in one request (`pipeline.py:148`); move to background job.
3. **Stale pricing table** — `analyze/pricing.py` hackathon-dated; `FALLBACK_PRICE=0` makes unpriced models read $0; `roast_model` default is placeholder id.
4. **Redaction is 8 regexes** — secrets outside patterns land in DB despite "never store secrets" guarantee (`analyze/roast.py:9-16`). Add entropy-based detection.
5. **Tests + CI** — no tests for `pipeline.py`, `security/credentials.py`, webhook/quota paths; shared FakeQuery lacks `gte/or_/upsert/delete/count`; no CI. Add GitHub Actions: pytest + bun test + tsc.
6. **Deploy story** — Worker scaffolded but no `deploy` script/docs; FastAPI has no deploy config at all.
7. **Frontend polish** — no `errorComponent`/`pendingComponent` on app routes; dead `AppPage` scaffold + hardcoded "Ingest/Idle" pill (`app-shell.tsx`); global search wired only to roast table; multi-trace batches never auto-navigate (`app.roasts.$batch.tsx:47-52`); landing has no Sign-up CTA (unauthed CTA lands on /login not /signup); profile lacks change-password/email/delete-account.

### Deferred (decide keep-dead or revive)
Ragas quality analyzer (PLAN.md stage 7, "cut first"), GAIA converter, LangSmith live-verification checklist, KMS key rotation (`security/credentials.py` half-built: `key_version` column exists, single hardcoded v1).

---

## Suggested release cut
**Feature 1 (report view + sharing) + all P0 + P1.1–1.2.** Closes every money leak, completes the paid loop, ships the headline feature with privacy built in. P1.4 integration is the marketing headline if capacity allows; P2 rides along opportunistically.
