import { db } from "./db.server";
import {
	type BatchRoast,
	type RoastDetail,
	type RoastListItem,
	type RoastMetrics,
	type RoastSource,
	summarizeRoasts,
} from "./roasts";

const SOURCES = new Set<RoastSource>([
	"synthetic",
	"upload",
	"bfcl",
	"gaia",
	"live",
]);

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function string(value: unknown, fallback = "") {
	return typeof value === "string" ? value : fallback;
}

function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function source(value: unknown): RoastSource {
	return typeof value === "string" && SOURCES.has(value as RoastSource)
		? (value as RoastSource)
		: "upload";
}

function mapListItem(value: unknown): RoastListItem | null {
	const row = record(value);
	const id = string(row.id);
	const slug = string(row.slug);
	if (!id || !slug) return null;

	return {
		id,
		slug,
		title: string(row.title, "Untitled trace"),
		source: source(row.source),
		score: number(row.score),
		tier: string(row.tier, "Unknown"),
		status: status(row.status),
		createdAt: string(row.created_at),
	};
}

function mapMetrics(value: unknown): RoastMetrics {
	const row = record(value);
	const findings = Array.isArray(row.findings) ? row.findings : [];
	const cost = record(row.cost);

	return {
		createdAt: string(row.created_at),
		score: number(row.score),
		status: status(row.status),
		secretCount: findings.filter(
			(finding) => record(finding).rule === "leaked-secret",
		).length,
		wasteUsd: number(cost.wasteUsd),
	};
}

export async function getDashboardData(userId: string) {
	const { data, error, count } = await db
		.from("roasts")
		.select(
			"id, slug, title, source, score, tier, findings, cost, status, created_at",
			{ count: "exact" },
		)
		.eq("user_id", userId)
		.order("created_at", { ascending: false });

	if (error) throw new Error(`Could not load roasts: ${error.message}`);

	const rows: unknown[] = data ?? [];
	const roasts = rows
		.map(mapListItem)
		.filter((row): row is RoastListItem => row !== null);

	return {
		stats: summarizeRoasts(rows.map(mapMetrics), count ?? roasts.length),
		recent: roasts.slice(0, 10),
		roasts,
	};
}

export async function getBatchRoasts(
	batchId: string,
	userId: string,
): Promise<BatchRoast[]> {
	const { data, error } = await db
		.from("roasts")
		.select("id, slug, title, status, score, tier, error")
		.eq("batch_id", batchId)
		.eq("user_id", userId)
		.order("created_at", { ascending: true });

	if (error) throw new Error(`Could not load batch: ${error.message}`);
	return ((data ?? []) as unknown[]).flatMap((value) => {
		const row = record(value);
		const id = string(row.id);
		const slug = string(row.slug);
		if (!id || !slug) return [];
		return [
			{
				id,
				slug,
				title: string(row.title, "Untitled trace"),
				status: status(row.status),
				score: number(row.score),
				tier: string(row.tier, "Unknown"),
				error: typeof row.error === "string" ? row.error : null,
			},
		];
	});
}

export async function getRoastBySlug(
	slug: string,
): Promise<RoastDetail | null> {
	const { data, error } = await db
		.from("roasts")
		.select(
			"id, slug, title, source, score, tier, status, created_at, roast_line, findings, cost",
		)
		.eq("slug", slug)
		.maybeSingle();

	if (error) throw new Error(`Could not load roast: ${error.message}`);
	const listItem = mapListItem(data);
	if (!listItem) return null;
	const row = record(data);
	const cost = record(row.cost);

	return {
		...listItem,
		roastLine: typeof row.roast_line === "string" ? row.roast_line : null,
		findings: (Array.isArray(row.findings) ? row.findings : []).map(
			(value, index) => {
				const finding = record(value);
				return {
					id: `${string(finding.rule, "finding")}-${index}`,
					rule: string(finding.rule, "finding"),
					category: string(finding.category, "reliability"),
					severity: number(finding.severity),
					message: string(
						finding.message ?? finding.detail,
						"Finding detected.",
					),
				};
			},
		),
		cost: {
			totalTokensIn: number(cost.totalTokensIn),
			totalTokensOut: number(cost.totalTokensOut),
			totalUsd: number(cost.totalUsd),
			wasteUsd: number(cost.wasteUsd),
			tokenSource: string(cost.tokenSource, "estimated"),
			monthlyProjectionUsd: number(cost.monthlyProjectionUsd),
			projectionAssumption: string(
				cost.projectionAssumption,
				"at 1,000 runs/day",
			),
		},
	};
}

function status(value: unknown) {
	return value === "processing" || value === "failed" ? value : "done";
}
