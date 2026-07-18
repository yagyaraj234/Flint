import { describe, expect, test } from "vitest";

import {
	fallbackRoastLine,
	formatShareText,
	publicRoastMeta,
	toPublicRoast,
	toPublicRoastSummaries,
	toPublicRoastSummary,
} from "./public-roasts";

describe("public roasts", () => {
	test("keeps only safe, valid wall fields", () => {
		expect(
			toPublicRoastSummaries([
				{
					slug: "hot-one",
					title: "Leaky agent",
					score: -4.2,
					tier: "Charcoal",
					roast_line: "This agent put its secrets on speakerphone.",
					created_at: "2026-07-18T00:00:00Z",
				},
				{ slug: "broken" },
			]),
		).toEqual([
			{
				slug: "hot-one",
				title: "Leaky agent",
				score: 0,
				tier: "Charcoal",
				roastLine: "This agent put its secrets on speakerphone.",
				createdAt: "2026-07-18T00:00:00Z",
			},
		]);
	});

	test("returns a redaction-safe card DTO and share metadata", () => {
		const roast = toPublicRoast({
			slug: "hot-one",
			title: "Leaky agent",
			source: "live",
			score: 12,
			tier: "Charcoal",
			roast_line: "This agent put its secrets on speakerphone.",
			findings: [
				{
					rule: "leaked-secret",
					category: "security",
					severity: 3,
					message: "Secret reached tool arguments.",
				},
			],
			cost: {
				total_tokens_in: 1000,
				total_tokens_out: 200,
				total_usd: 1.25,
				waste_usd: 0.5,
				token_source: "measured",
				monthly_projection_usd: 15000,
				projection_assumption: "at 1,000 runs/day",
			},
			detailed_report: {
				summary: "A leaked key reached a tool call.",
				actions: [
					{
						rule: "leaked-secret",
						issue: "Secret reached tool arguments.",
						impact: "Credential exposure.",
						fix: "Rotate the key.",
						verification: "Rerun the scan.",
					},
				],
				generated: true,
				model: "gpt-5.6-luna",
			},
			normalized: {
				spans: [
					{
						id: "tool-1",
						type: "tool",
						name: "send_email",
						duration_ms: 42,
						input: "sk-FAKE000000000000000000000000",
						meta: { private: true },
					},
				],
			},
		});

		expect(roast).not.toBeNull();
		if (!roast) return;
		expect(roast.timeline).toEqual([
			{
				id: "tool-1",
				type: "tool",
				name: "send_email",
				model: null,
				tokensIn: null,
				tokensOut: null,
				durationMs: 42,
			},
		]);
		expect(roast.detailedReport).toMatchObject({
			generated: true,
			model: "gpt-5.6-luna",
			actions: [{ fix: "Rotate the key." }],
		});
		expect(formatShareText(roast, "https://roast0.dev/r/hot-one")).toContain(
			"12/100 · Charcoal · $0.50 waste found",
		);
		expect(publicRoastMeta(roast)).toEqual({
			title: "This agent put its secrets on speakerphone. · Flint",
			description: "12/100 · Charcoal · $0.50 waste found. Leaky agent",
		});
	});

	test("rejects malformed public data and applies safe defaults", () => {
		expect(toPublicRoastSummary(null)).toBeNull();
		expect(toPublicRoastSummary({ slug: "missing-fields" })).toBeNull();
		expect(toPublicRoastSummaries({})).toEqual([]);
		expect(toPublicRoast({ slug: "missing-fields" })).toBeNull();

		const roast = toPublicRoast({
			slug: "safe-defaults",
			title: "Defaults",
			source: "upload",
			score: 101,
			tier: "Rare",
			findings: [
				null,
				{ category: "unknown", severity: 2, message: "discard" },
				{ category: "cost", severity: 2.5, title: "Prompt bloat" },
			],
			cost: null,
			normalized: {
				spans: [null, { name: "fallback span" }],
			},
		});

		expect(roast).toMatchObject({
			score: 100,
			roastLine: null,
			createdAt: null,
			findings: [
				{
					rule: "Prompt bloat",
					category: "cost",
					severity: 2,
					message: "Prompt bloat",
					estWasteUsd: null,
				},
			],
			cost: {
				totalTokensIn: 0,
				totalTokensOut: 0,
				totalUsd: 0,
				wasteUsd: 0,
				tokenSource: "estimated",
				monthlyProjectionUsd: 0,
				projectionAssumption: "projection unavailable",
			},
			timeline: [
				{
					id: "span-2",
					type: "other",
					name: "fallback span",
					model: null,
					tokensIn: null,
					tokensOut: null,
					durationMs: null,
				},
			],
		});
	});

	test("supplies a verdict for every tier", () => {
		expect(fallbackRoastLine("Rare")).toContain("Clean execution");
		expect(fallbackRoastLine("Medium")).toContain("fingerprints");
		expect(fallbackRoastLine("Well Done")).toContain("budget");
		expect(fallbackRoastLine("Charcoal")).toContain("receipts");
	});
});
