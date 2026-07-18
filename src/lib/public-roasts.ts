export interface PublicRoastSummary {
	slug: string;
	title: string;
	score: number;
	tier: string;
	roastLine: string | null;
	createdAt: string | null;
}

export interface LiveWallData {
	roasts: PublicRoastSummary[];
	available: boolean;
}

export type PublicFindingCategory = "security" | "reliability" | "cost";
export type PublicTokenSource = "measured" | "estimated" | "mixed";

export interface PublicFinding {
	rule: string;
	category: PublicFindingCategory;
	severity: 1 | 2 | 3;
	message: string;
	estWasteUsd: number | null;
}

export interface PublicCostReport {
	totalTokensIn: number;
	totalTokensOut: number;
	totalUsd: number;
	wasteUsd: number;
	tokenSource: PublicTokenSource;
	monthlyProjectionUsd: number;
	projectionAssumption: string;
}

export interface PublicReportAction {
	rule: string;
	issue: string;
	impact: string;
	fix: string;
	verification: string;
}

export interface PublicDetailedReport {
	summary: string;
	actions: PublicReportAction[];
	generated: boolean;
	model: string | null;
}

export interface PublicSpan {
	id: string;
	type: string;
	name: string;
	model: string | null;
	tokensIn: number | null;
	tokensOut: number | null;
	durationMs: number | null;
}

export interface PublicRoast extends PublicRoastSummary {
	source: string;
	findings: PublicFinding[];
	cost: PublicCostReport;
	detailedReport: PublicDetailedReport;
	timeline: PublicSpan[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseFinding(value: unknown): PublicFinding | null {
	if (!isRecord(value)) return null;
	const category = value.category;
	const severity = finiteNumber(value.severity);
	const message = value.message ?? value.detail ?? value.title;
	if (
		(category !== "security" &&
			category !== "reliability" &&
			category !== "cost") ||
		severity === null ||
		typeof message !== "string"
	) {
		return null;
	}

	return {
		rule:
			typeof value.rule === "string"
				? value.rule
				: typeof value.title === "string"
					? value.title
					: "trace-finding",
		category,
		severity: severity >= 3 ? 3 : severity >= 2 ? 2 : 1,
		message,
		estWasteUsd: finiteNumber(value.est_waste_usd),
	};
}

function parseCost(value: unknown): PublicCostReport {
	const cost = isRecord(value) ? value : {};
	const tokenSource = cost.token_source;

	return {
		totalTokensIn: finiteNumber(cost.total_tokens_in) ?? 0,
		totalTokensOut: finiteNumber(cost.total_tokens_out) ?? 0,
		totalUsd: finiteNumber(cost.total_usd) ?? 0,
		wasteUsd: finiteNumber(cost.waste_usd) ?? 0,
		tokenSource:
			tokenSource === "measured" ||
			tokenSource === "mixed" ||
			tokenSource === "estimated"
				? tokenSource
				: "estimated",
		monthlyProjectionUsd: finiteNumber(cost.monthly_projection_usd) ?? 0,
		projectionAssumption:
			typeof cost.projection_assumption === "string"
				? cost.projection_assumption
				: "projection unavailable",
	};
}

function parseDetailedReport(value: unknown): PublicDetailedReport {
	const report = isRecord(value) ? value : {};
	const actions = Array.isArray(report.actions) ? report.actions : [];
	return {
		summary:
			typeof report.summary === "string"
				? report.summary
				: "Detailed assessment is unavailable for this older report.",
		actions: actions.flatMap((action) => {
			if (!isRecord(action)) return [];
			const fields = [
				"rule",
				"issue",
				"impact",
				"fix",
				"verification",
			] as const;
			if (!fields.every((field) => typeof action[field] === "string"))
				return [];
			return [
				{
					rule: action.rule as string,
					issue: action.issue as string,
					impact: action.impact as string,
					fix: action.fix as string,
					verification: action.verification as string,
				},
			];
		}),
		generated: report.generated === true,
		model: typeof report.model === "string" ? report.model : null,
	};
}

function parseSpan(value: unknown, index: number): PublicSpan | null {
	if (!isRecord(value) || typeof value.name !== "string") return null;

	return {
		id: typeof value.id === "string" ? value.id : `span-${index + 1}`,
		type: typeof value.type === "string" ? value.type : "other",
		name: value.name,
		model: typeof value.model === "string" ? value.model : null,
		tokensIn: finiteNumber(value.tokens_in),
		tokensOut: finiteNumber(value.tokens_out),
		durationMs: finiteNumber(value.duration_ms),
	};
}

function parseTimeline(value: unknown): PublicSpan[] {
	if (!isRecord(value) || !Array.isArray(value.spans)) return [];
	// ponytail: public cards cap at 50 spans; paginate if shared traces routinely exceed that.
	return value.spans.slice(0, 50).flatMap((span, index) => {
		const parsed = parseSpan(span, index);
		return parsed ? [parsed] : [];
	});
}

export function toPublicRoastSummary(
	value: unknown,
): PublicRoastSummary | null {
	if (!isRecord(value)) return null;

	const {
		slug,
		title,
		score,
		tier,
		roast_line: roastLine,
		created_at: createdAt,
	} = value;
	if (
		typeof slug !== "string" ||
		typeof title !== "string" ||
		typeof score !== "number" ||
		!Number.isFinite(score) ||
		typeof tier !== "string"
	) {
		return null;
	}

	return {
		slug,
		title,
		score: Math.max(0, Math.min(100, Math.round(score))),
		tier,
		roastLine: typeof roastLine === "string" ? roastLine : null,
		createdAt: typeof createdAt === "string" ? createdAt : null,
	};
}

export function toPublicRoastSummaries(value: unknown): PublicRoastSummary[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((row) => {
		const roast = toPublicRoastSummary(row);
		return roast ? [roast] : [];
	});
}

export function toPublicRoast(value: unknown): PublicRoast | null {
	const summary = toPublicRoastSummary(value);
	if (!summary || !isRecord(value) || typeof value.source !== "string")
		return null;

	return {
		...summary,
		source: value.source,
		findings: Array.isArray(value.findings)
			? value.findings.flatMap((finding) => {
					const parsed = parseFinding(finding);
					return parsed ? [parsed] : [];
				})
			: [],
		cost: parseCost(value.cost),
		detailedReport: parseDetailedReport(value.detailed_report),
		timeline: parseTimeline(value.normalized),
	};
}

export function fallbackRoastLine(tier: string): string {
	switch (tier.toLowerCase()) {
		case "rare":
			return "Clean execution. Suspiciously competent.";
		case "medium":
			return "It works, but the trace left fingerprints everywhere.";
		case "well done":
			return "This agent cooked the budget longer than the task.";
		default:
			return "The agent did not fail quietly. It brought receipts.";
	}
}

export function formatShareText(roast: PublicRoast, url: string): string {
	return `${roast.roastLine ?? fallbackRoastLine(roast.tier)}\n\n${roast.score}/100 · ${roast.tier} · $${roast.cost.wasteUsd.toFixed(2)} waste found\n${url}`;
}

export function publicRoastMeta(roast: PublicRoast): {
	title: string;
	description: string;
} {
	const line = roast.roastLine ?? fallbackRoastLine(roast.tier);
	return {
		title: `${line} · Flint`,
		description: `${roast.score}/100 · ${roast.tier} · $${roast.cost.wasteUsd.toFixed(2)} waste found. ${roast.title}`,
	};
}
