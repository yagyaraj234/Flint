export type RoastSource =
	| "synthetic"
	| "upload"
	| "bfcl"
	| "gaia"
	| "live"
	| "langsmith";

export type RoastStatus = "processing" | "done" | "failed";

export interface RoastListItem {
	id: string;
	slug: string;
	title: string;
	source: RoastSource;
	score: number;
	tier: string;
	findingCounts?: FindingCounts;
	status: RoastStatus;
	createdAt: string;
}

export interface FindingCounts {
	critical: number;
	warning: number;
	notice: number;
}

export interface RoastMetrics {
	createdAt: string;
	score: number;
	status: RoastStatus;
	secretCount: number;
	wasteUsd: number;
}

export interface DashboardStats {
	totalRoasts: number;
	secretsCaught: number;
	wasteUsd: number;
	worstScoreThisWeek: number | null;
}

export interface BatchRoast {
	id: string;
	slug: string;
	title: string;
	status: RoastStatus;
	score: number;
	tier: string;
	findingCounts?: FindingCounts;
	error: string | null;
}

export interface RoastDetail extends RoastListItem {
	roastLine: string | null;
	findings: Array<{
		id: string;
		rule: string;
		category: string;
		severity: number;
		message: string;
	}>;
	cost: {
		totalTokensIn: number;
		totalTokensOut: number;
		totalUsd: number;
		wasteUsd: number;
		tokenSource: string;
		monthlyProjectionUsd: number;
		projectionAssumption: string;
	};
}

export function summarizeRoasts(
	rows: RoastMetrics[],
	totalRoasts: number,
	nowMs = Date.now(),
): DashboardStats {
	const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1_000;
	const weeklyScores = rows
		.filter(
			(row) =>
				row.status === "done" && new Date(row.createdAt).getTime() >= weekAgo,
		)
		.map((row) => row.score);

	return {
		totalRoasts,
		secretsCaught: rows.reduce((sum, row) => sum + row.secretCount, 0),
		wasteUsd: rows.reduce((sum, row) => sum + row.wasteUsd, 0),
		worstScoreThisWeek:
			weeklyScores.length > 0 ? Math.min(...weeklyScores) : null,
	};
}

export function filterRoasts(rows: RoastListItem[], query: string) {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	return normalizedQuery
		? rows.filter((row) =>
				row.title.toLocaleLowerCase().includes(normalizedQuery),
			)
		: rows;
}

export function findingCounts(value: unknown): FindingCounts {
	const counts: FindingCounts = { critical: 0, warning: 0, notice: 0 };
	if (!Array.isArray(value)) return counts;

	for (const finding of value) {
		const severity =
			finding && typeof finding === "object"
				? (finding as { severity?: unknown }).severity
				: undefined;
		if (severity === 3) counts.critical += 1;
		else if (severity === 2) counts.warning += 1;
		else if (severity === 1) counts.notice += 1;
	}
	return counts;
}
