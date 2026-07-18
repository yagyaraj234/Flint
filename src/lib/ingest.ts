import type { RoastSource } from "./roasts";

export interface RedactionHit {
	rule: string;
}

export interface Finding {
	rule: string;
	category: "security" | "reliability" | "cost";
	severity: 1 | 2 | 3;
	spanIds: string[];
	message: string;
	estWasteUsd?: number;
}

export interface NormalizedSpan {
	id: string;
	parentId: string | null;
	type: "llm" | "tool" | "handoff" | "guardrail" | "other";
	name: string;
	model: string | null;
	startMs: number | null;
	durationMs: number | null;
	tokensIn: number;
	tokensOut: number;
	tokenSource: "measured" | "estimated";
	input: string;
	output: string;
	meta: Record<string, unknown>;
}

export interface NormalizedTrace {
	traceId: string;
	workflow: string;
	spans: NormalizedSpan[];
}

export interface AnalysisResult {
	normalized: NormalizedTrace;
	findings: Finding[];
	cost: {
		totalTokensIn: number;
		totalTokensOut: number;
		totalUsd: number;
		wasteUsd: number;
		tokenSource: "measured" | "estimated" | "mixed";
		monthlyProjectionUsd: number;
		projectionAssumption: string;
	};
	score: number;
	tier: "Rare" | "Medium" | "Well Done" | "Charcoal";
}

const SECRET_PATTERNS: Array<{ rule: string; re: RegExp }> = [
	{ rule: "openai-key", re: /sk-[A-Za-z0-9_-]{20,}/g },
	{ rule: "aws-key", re: /AKIA[0-9A-Z]{16}/g },
	{ rule: "github-token", re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
	{ rule: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
	{ rule: "google-key", re: /AIza[0-9A-Za-z_-]{35}/g },
	{
		rule: "jwt",
		re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
	},
	{ rule: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
	{ rule: "bearer", re: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
];

const SOURCES = new Set<RoastSource>([
	"synthetic",
	"upload",
	"bfcl",
	"gaia",
	"live",
]);

export function parseTraceDataset(
	text: string,
): Array<Record<string, unknown>> {
	const input = text.trim();
	if (!input) throw new Error("Paste JSON or choose a trace file.");

	let traces: unknown[];
	try {
		const parsed: unknown = JSON.parse(input);
		traces = Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		traces = input
			.split(/\r?\n/)
			.filter((line) => line.trim())
			.map((line, index) => {
				try {
					return JSON.parse(line) as unknown;
				} catch {
					throw new Error(`Invalid JSONL on line ${index + 1}.`);
				}
			});
	}

	if (traces.length === 0) throw new Error("Dataset contains no traces.");
	if (traces.length > 20) throw new Error("Upload at most 20 traces at once.");

	return traces.map((trace, index) => {
		if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
			throw new Error(`Trace ${index + 1} must be a JSON object.`);
		}
		return trace as Record<string, unknown>;
	});
}

export function redactTrace(trace: Record<string, unknown>) {
	const hits: RedactionHit[] = [];

	function walk(value: unknown): unknown {
		if (typeof value === "string") {
			return SECRET_PATTERNS.reduce((redacted, pattern) => {
				pattern.re.lastIndex = 0;
				return redacted.replace(pattern.re, () => {
					hits.push({ rule: pattern.rule });
					return `«REDACTED:${pattern.rule}»`;
				});
			}, value);
		}
		if (Array.isArray(value)) return value.map(walk);
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([key, child]) => [key, walk(child)]),
			);
		}
		return value;
	}

	return {
		trace: walk(trace) as Record<string, unknown>,
		hits,
	};
}

export function findingsFromRedactions(hits: RedactionHit[]): Finding[] {
	return hits.map((hit) => ({
		rule: "leaked-secret",
		category: "security",
		severity: 3,
		spanIds: [],
		message: `Removed a ${hit.rule} secret before storage.`,
	}));
}

export function normalizeTrace(
	trace: Record<string, unknown>,
	fallbackId: string,
): NormalizedTrace {
	const nested = record(trace.data);
	const candidates = Array.isArray(trace.spans)
		? trace.spans
		: Array.isArray(nested.spans)
			? nested.spans
			: [trace];

	const spans = candidates.map((candidate, index) => {
		const span = record(candidate);
		const data = record(span.data);
		const usage = record(span.usage ?? data.usage);
		const input = stringify(
			span.input ??
				span.prompt ??
				span.messages ??
				span.args ??
				data.input ??
				data.args,
		);
		const output = stringify(
			span.output ?? span.response ?? span.result ?? data.output ?? data.result,
		);
		const measuredInput = numeric(
			usage.input_tokens ?? usage.prompt_tokens ?? span.input_tokens,
		);
		const measuredOutput = numeric(
			usage.output_tokens ?? usage.completion_tokens ?? span.output_tokens,
		);
		const rawType = string(span.type ?? data.type).toLowerCase();

		return {
			id: string(span.id ?? span.span_id, `span-${index + 1}`),
			parentId: nullableString(span.parent_id ?? span.parentId),
			type: spanType(rawType),
			name: string(
				span.name ?? data.name ?? span.model ?? data.model,
				`span ${index + 1}`,
			),
			model: nullableString(span.model ?? data.model),
			startMs: nullableNumber(span.start_ms ?? span.startMs),
			durationMs: nullableNumber(span.duration_ms ?? span.durationMs),
			tokensIn: measuredInput ?? estimateTokens(input),
			tokensOut: measuredOutput ?? estimateTokens(output),
			tokenSource:
				measuredInput !== null || measuredOutput !== null
					? ("measured" as const)
					: ("estimated" as const),
			input,
			output,
			meta: span,
		};
	});

	return {
		traceId: string(trace.trace_id ?? trace.traceId ?? trace.id, fallbackId),
		workflow: string(
			trace.workflow ?? trace.workflow_name ?? trace.name ?? trace.title,
			"Uploaded trace",
		),
		spans,
	};
}

export function analyzeTrace(
	normalized: NormalizedTrace,
	redactionFindings: Finding[],
): AnalysisResult {
	const findings = [...redactionFindings];
	const pii = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?[\d ()-]{10,}/;
	const insecureUrl = /http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])\S+/i;

	for (const span of normalized.spans) {
		if (pii.test(span.input)) {
			findings.push({
				rule: "pii-in-prompt",
				category: "security",
				severity: 1,
				spanIds: [span.id],
				message: "Prompt contains possible email or phone data.",
			});
		}
		if (span.type === "tool" && insecureUrl.test(span.input)) {
			findings.push({
				rule: "insecure-url",
				category: "security",
				severity: 1,
				spanIds: [span.id],
				message: "Tool input calls a non-local HTTP URL.",
			});
		}
	}

	addRepeatedFindings(findings, normalized.spans);
	const last = normalized.spans.at(-1);
	const lastStatus = string(
		last?.meta.status ?? last?.meta.error,
	).toLowerCase();
	if (last && (lastStatus.includes("error") || lastStatus.includes("fail"))) {
		findings.push({
			rule: "error-tail",
			category: "reliability",
			severity: 2,
			spanIds: [last.id],
			message: "Trace ends in an error state.",
		});
	}

	const score = Math.max(
		0,
		100 -
			findings.reduce((deduction, finding) => {
				const base =
					finding.severity === 3 ? 25 : finding.severity === 2 ? 12 : 5;
				return (
					deduction +
					(finding.category === "security" ? Math.round(base * 1.5) : base)
				);
			}, 0),
	);
	const sources = new Set(normalized.spans.map((span) => span.tokenSource));

	return {
		normalized,
		findings,
		cost: {
			totalTokensIn: normalized.spans.reduce(
				(sum, span) => sum + span.tokensIn,
				0,
			),
			totalTokensOut: normalized.spans.reduce(
				(sum, span) => sum + span.tokensOut,
				0,
			),
			totalUsd: 0,
			wasteUsd: 0,
			tokenSource:
				sources.size > 1
					? "mixed"
					: (sources.values().next().value ?? "estimated"),
			monthlyProjectionUsd: 0,
			projectionAssumption: "at 1,000 runs/day",
		},
		score,
		tier:
			score >= 90
				? "Rare"
				: score >= 65
					? "Medium"
					: score >= 35
						? "Well Done"
						: "Charcoal",
	};
}

export function detectSource(trace: Record<string, unknown>): RoastSource {
	if (
		typeof trace.source === "string" &&
		SOURCES.has(trace.source as RoastSource)
	) {
		return trace.source as RoastSource;
	}
	const dataset = string(trace.dataset).toLowerCase();
	if (dataset.includes("bfcl")) return "bfcl";
	if (dataset.includes("gaia")) return "gaia";
	return "upload";
}

export function parseSource(
	value: unknown,
	fallback: RoastSource,
): RoastSource {
	return typeof value === "string" && SOURCES.has(value as RoastSource)
		? (value as RoastSource)
		: fallback;
}

function addRepeatedFindings(findings: Finding[], spans: NormalizedSpan[]) {
	const toolCalls = new Map<string, string[]>();
	const llmCalls = new Map<string, string[]>();
	for (const span of spans) {
		const key = `${span.name}\u0000${span.input.trim()}`;
		const calls =
			span.type === "tool" ? toolCalls : span.type === "llm" ? llmCalls : null;
		if (calls) calls.set(key, [...(calls.get(key) ?? []), span.id]);
	}
	for (const spanIds of toolCalls.values()) {
		if (spanIds.length > 3) {
			findings.push({
				rule: "tool-loop",
				category: "reliability",
				severity: spanIds.length > 8 ? 3 : 2,
				spanIds,
				message: `Repeated the same tool call ${spanIds.length} times.`,
			});
		}
	}
	for (const spanIds of llmCalls.values()) {
		if (spanIds.length > 1) {
			findings.push({
				rule: "duplicate-llm-call",
				category: "cost",
				severity: 2,
				spanIds,
				message: `Repeated the same LLM input ${spanIds.length} times.`,
			});
		}
	}
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function string(value: unknown, fallback = "") {
	return typeof value === "string" && value ? value : fallback;
}

function nullableString(value: unknown) {
	return typeof value === "string" && value ? value : null;
}

function numeric(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumber(value: unknown) {
	return numeric(value);
}

function stringify(value: unknown) {
	if (typeof value === "string") return value;
	if (value === undefined || value === null) return "";
	return JSON.stringify(value);
}

function estimateTokens(value: string) {
	return Math.ceil(value.length / 4);
}

function spanType(rawType: string): NormalizedSpan["type"] {
	if (/generation|response|llm|model/.test(rawType)) return "llm";
	if (/function|tool/.test(rawType)) return "tool";
	if (rawType.includes("handoff")) return "handoff";
	if (rawType.includes("guardrail")) return "guardrail";
	return "other";
}
