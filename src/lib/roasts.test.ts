import { describe, expect, test } from "vitest";

import { filterRoasts, summarizeRoasts } from "./roasts";

describe("dashboard roast helpers", () => {
	test("summarizes real rows and filters titles", () => {
		const now = Date.parse("2026-07-18T12:00:00.000Z");
		const stats = summarizeRoasts(
			[
				{
					createdAt: "2026-07-17T12:00:00.000Z",
					score: 18,
					status: "done",
					secretCount: 2,
					wasteUsd: 1.25,
				},
				{
					createdAt: "2026-07-01T12:00:00.000Z",
					score: 4,
					status: "done",
					secretCount: 0,
					wasteUsd: 0.5,
				},
			],
			2,
			now,
		);

		expect(stats).toEqual({
			totalRoasts: 2,
			secretsCaught: 2,
			wasteUsd: 1.75,
			worstScoreThisWeek: 18,
		});
		expect(
			filterRoasts(
				[
					{
						id: "1",
						slug: "leaky",
						title: "Leaky agent",
						source: "upload",
						score: 18,
						tier: "Charcoal",
						status: "done",
						createdAt: "2026-07-17T12:00:00.000Z",
					},
				],
				"LEAK",
			),
		).toHaveLength(1);
	});

	test("handles an empty week and an empty search", () => {
		expect(
			summarizeRoasts(
				[
					{
						createdAt: "invalid",
						score: 10,
						status: "processing",
						secretCount: 0,
						wasteUsd: 0,
					},
				],
				1,
				Date.parse("2026-07-18T12:00:00.000Z"),
			),
		).toMatchObject({ worstScoreThisWeek: null });

		const rows = [
			{
				id: "1",
				slug: "one",
				title: "One",
				source: "upload" as const,
				score: 100,
				tier: "Rare",
				status: "done" as const,
				createdAt: "2026-07-18T12:00:00.000Z",
			},
		];
		expect(filterRoasts(rows, " ")).toBe(rows);
	});
});
