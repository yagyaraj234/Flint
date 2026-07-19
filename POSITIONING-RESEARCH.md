# Helix positioning research

Research date: 2026-07-19. Scope: official product pages/docs and Helix's implemented behavior. No traffic-volume or market-size claims.

## Naming outcome

[Flint AI by SandboxAQ](https://www.flintai.dev/) is active in the same buyer/category neighborhood. Its official page calls it an AgentOps platform, uses “Ship AI agents with confidence,” scans agent source code for security risks, runs adversarial runtime evaluations, and returns an OWASP-mapped reliability score. The Helix name removes the prior same-name conflict, though the products still overlap in audience and security/reliability language.

**Naming decision:** use **Helix · AI agent cost and risk scanner** or **Helix for agent traces**. A proper trademark/domain review still needs legal and search-channel work outside this report.

## Recommendation

**Category:** AI agent cost and risk scanner

**Category descriptor:** Cost, reliability, and security analysis for AI agent traces.

**Brand headline:** See where your agents waste money.

**Replace hero support copy with:**

> Helix scans agent traces for duplicate model calls, bloated prompts, tool loops, failed steps, and exposed credentials. Then it shows what to fix.

**Primary CTA:** Analyze a trace

**Secondary CTA:** View demo report

**One-line positioning:** For AI engineers who need to understand avoidable run cost and operational risk, Helix analyzes completed agent traces for model waste, tool loops, failed steps, and exposed credentials, then returns a scored, shareable report. It complements observability and runtime guardrails; it does not block agent actions.

Why this shape:

- “AI agent cost and risk scanner” leads with the intended job without claiming a full observability platform.
- Cost leads the hierarchy. Reliability and credential findings support it instead of defining the product as a secrets scanner.
- “Completed” makes the post-run boundary clear. Current pipeline parses, redacts, analyzes, scores, and only then persists ([assessment.py](api/app/assessment.py#L41-L63)); LangSmith integration also scans completed traces hourly ([app.integrations.index.tsx](src/routes/app.integrations.index.tsx#L68-L83)).
- “Supported secrets” is deliberate. Code detects email/phone PII but current recursive redactor only replaces supported credential/token patterns ([roast.py](api/app/analyze/roast.py#L35-L48), [redact.py](api/app/normalize/redact.py#L8-L16)). Do not imply all findings or PII are redacted.

## Market language

| Product | Official category/headline | Main promise and CTA | Implication for Helix |
|---|---|---|---|
| Flint AI / SandboxAQ | “AgentOps platform”; “Ship AI agents with confidence” | Source-code security scans, adversarial runtime evals, reliability score; `pip install flintai-cli`. [Official page](https://www.flintai.dev/) | Helix removes the prior same-name risk. Keep the explicit trace category modifier because the agent-security scan/score language still overlaps. |
| LangSmith | “AI Agent Observability Platform”; “Know what your agents are really doing” | Complete visibility, tracing, monitoring, cost tracking, evals; “Start building” / “Get a demo.” [Official page](https://www.langchain.com/langsmith/observability) | Do not compete on “complete visibility.” Sell a fast assessment of trace data LangSmith already captures. |
| Langfuse | “Open Source AI Engineering Platform” | Full lifecycle: tracing, prompt management, evals, dashboards; “Start free.” [Official page](https://langfuse.com/) | “AI engineering platform” is broad and crowded. Helix should stay task-shaped. |
| Arize Phoenix | “The open-source platform for agent development and evaluation” | Trace, evaluate, iterate; “Get started” / “Self-Host.” [Official page](https://arize.com/phoenix/) | Avoid generic “debug and improve agents” copy unless tied to Helix's specific checks/report. |
| Braintrust | “See every AI call in production” | Trace agents, score live traffic, alert, turn production traces into evals; “Start free” / “Get a demo.” [Official page](https://www.braintrust.dev/learn/ai-observability/v0) | “Every,” “live,” alerts, and regression prevention imply continuous instrumentation Helix does not provide. |
| Datadog | “Agent Observability”; “Ship AI agents faster, with confidence” | Experiments plus production tracing, monitoring, evals, security, cost; “Try Agent Observability Free” / “Try In Browser.” [Official page](https://www.datadoghq.com/products/ai/agent-observability/) | Individual Helix features are not unique: Datadog also documents sensitive-data scanning/redaction, cost, errors, and loops. Differentiate on one-trace-in, opinionated report-out workflow, not a feature checklist. |
| Check Point AI Guardrails / Lakera | Runtime protection, real-time threat detection, data-leak prevention | Screen interactions in application control flow and let applications block, warn, or alert. [Official Guard API docs](https://docs.lakera.ai/docs/api/guard) | Never say Helix “stops,” “prevents,” “protects at runtime,” or catches an action “before it executes.” Helix is post-run assessment. |

Market center is “observe, evaluate, improve, ship.” Runtime security center is “protect, prevent, block.” Truthful whitespace is narrower: **scan a completed trace, redact supported secrets before Helix persists it, and get one deterministic security/reliability/cost score plus an actionable report.** This is a product-shape distinction, not a claim that no competitor offers any matching feature.

## User language worth owning

Use consistently:

- **Trace** for input artifact.
- **Scan** for one completed assessment; this matches Helix's domain glossary ([CONTEXT.md](CONTEXT.md#L3-L5)).
- **Finding** for one detected problem.
- **Helix score** for 0–100 output.
- **Report** for the detailed, shareable result; keep **roast** as report personality, not category.
- **Security, reliability, cost** as fixed three-part taxonomy.
- **Upload, API, or LangSmith** as input paths.

Avoid:

- **Observability platform** — broader platforms promise continuous tracing, dashboards, monitoring, evals, and alerts.
- **Guardrail / firewall / protection** — implies runtime enforcement.
- **Unsafe tool calls** — implementation specifically catches insecure HTTP tool URLs, repeated identical calls, failed tools without retry, and slow spans; it does not judge arbitrary tool policy ([roast.py](api/app/analyze/roast.py#L51-L157)).
- **Redacts what it finds** — reliability/cost findings are not redacted, and PII is detected but not currently redacted.
- **Every trace** — implies universal formats and continuous coverage. Prefer “your traces” or “completed traces.”
- **Before production** — LangSmith scans may inspect production traces after completion. Say “before Helix stores the trace” only for supported-secret redaction; source systems may already hold it.

Trace data genuinely carries sensitive-content risk: OpenAI's Agents SDK says generation and function spans can contain sensitive inputs/outputs, and OpenTelemetry warns that tool-call arguments and results may contain sensitive information. [OpenAI tracing docs](https://openai.github.io/openai-agents-js/guides/tracing/#sensitive-data), [OpenTelemetry GenAI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/). OWASP's Agentic Top 10 supplies credible security context, but it is a risk framework, not proof that Helix covers all agentic risks. [OWASP official page](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

## Landing-copy implementation status

The landing page now uses the recommended cost-first headline, descriptor,
support copy, and **Analyze a trace** CTA. Its implemented findings list names
the concrete deterministic checks, and its product preview is labelled
“Example report · demo trace.” Keep new copy within the post-run boundary and
do not reintroduce “every trace,” runtime-protection, or universal-redaction
claims.

Implemented proof behind the message:

- Security rules: supported secret hits, PII in inputs, insecure HTTP tool URLs ([roast.py](api/app/analyze/roast.py#L20-L62)).
- Reliability rules: identical tool calls repeated 4+, error-ending traces, failed tools without retry, spans over 15 seconds ([roast.py](api/app/analyze/roast.py#L69-L157)).
- Cost rules: duplicate LLM inputs, repeated 2,000+ token prefixes, calls over 20,000 input tokens, and waste estimates ([cost.py](api/app/analyze/cost.py#L50-L173)).
- Output: deterministic score/tier plus detailed report ([assessment.py](api/app/assessment.py#L44-L63)); report UI supports share text/image and browser sharing ([ShareButtons.tsx](src/components/ShareButtons.tsx#L93-L187)).

## Recommended copy system

### Homepage

**Eyebrow:** AI AGENT COST & RISK SCANNER

**Headline:** See where your agents waste money.

**Support:** Helix scans agent traces for duplicate model calls, bloated prompts, tool loops, failed steps, and exposed credentials. Then it shows what to fix.

**Primary CTA:** Analyze a trace

**Secondary CTA:** View demo report

**What-it-finds intro:** Deterministic cost, reliability, and security checks for completed agent traces.

**Integration line:** Paste JSON, upload JSONL, call the API, or connect a LangSmith project for hourly scans.

**Footer descriptor:** Helix · AI agent cost & risk scanner

### Search/meta

**Homepage title:** Helix — AI Agent Cost & Risk Scanner

**Homepage description:** Helix scans AI agent traces for duplicate model calls, bloated prompts, tool loops, failed steps, and exposed credentials, then shows what to fix.

**Analyzer title:** AI Agent Trace Analyzer for Security, Reliability & Cost | Helix

### Alternate headlines to test

1. **See where your agents waste money.** Best cost-first promise.
2. **Find costly agent behavior.** Shorter, but less concrete.
3. **Your agent trace has receipts.** Strong roast/share voice; weakest standalone explanation.

Do not test more until click-through or scan-start volume can distinguish them. Copy variants without traffic are decoration.

## API proof

The homepage no longer presents a curl command as product proof. Keep direct
API examples in the versioned backend contract, where their authentication and
payload shape can stay accurate.
