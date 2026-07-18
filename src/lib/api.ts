// Server-side helpers for the FastAPI backend (PLAN.md "API contract").
// Call from loaders / server functions only — API_URL is a server env value.
// Field names are snake_case end to end; do not convert casing.

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export type Source = "synthetic" | "upload" | "bfcl" | "gaia" | "live";
export type TraceFormat = "openai-agents" | "generic";
export type SpanType = "llm" | "tool" | "handoff" | "guardrail" | "other";
export type TokenSource = "measured" | "estimated";
export type Category = "security" | "reliability" | "cost";
export type Tier = "Rare" | "Medium" | "Well Done" | "Charcoal";

export interface Span {
	id: string;
	parent_id: string | null;
	type: SpanType;
	name: string;
	model: string | null;
	start_ms: number | null;
	duration_ms: number | null;
	tokens_in: number | null;
	tokens_out: number | null;
	token_source: TokenSource | null;
	input: string;
	output: string;
	meta: Record<string, unknown>;
}

export interface NormalizedTrace {
	trace_id: string;
	workflow: string;
	spans: Span[];
}

export interface Finding {
	rule: string;
	category: Category;
	severity: 1 | 2 | 3;
	span_ids: string[];
	message: string;
	est_waste_usd?: number | null;
}

export interface CostReport {
	total_tokens_in: number;
	total_tokens_out: number;
	total_usd: number;
	waste_usd: number;
	token_source: TokenSource | "mixed";
	monthly_projection_usd: number;
	projection_assumption: string;
}

export interface RoastRow {
	id: string;
	slug: string;
	title: string;
	source: Source;
	raw_trace: unknown;
	normalized: NormalizedTrace;
	findings: Finding[];
	cost: CostReport;
	score: number;
	tier: Tier;
	roast_line: string | null;
	created_at: string;
}

export interface RecentRoast {
	slug: string;
	title: string;
	score: number;
	tier: Tier;
	created_at: string;
}

export interface IngestBody {
	source: Source;
	title?: string;
	format?: TraceFormat;
	trace: unknown;
}

export async function ingestTrace(body: IngestBody): Promise<{ slug: string }> {
	const res = await fetch(`${API_URL}/ingest`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
	return res.json();
}

export async function getRoast(slug: string): Promise<RoastRow | null> {
	const res = await fetch(`${API_URL}/roasts/${encodeURIComponent(slug)}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`getRoast failed: ${res.status}`);
	return res.json();
}

export async function getRecentRoasts(): Promise<RecentRoast[]> {
	const res = await fetch(`${API_URL}/roasts/recent`);
	if (!res.ok) throw new Error(`getRecentRoasts failed: ${res.status}`);
	return res.json();
}
