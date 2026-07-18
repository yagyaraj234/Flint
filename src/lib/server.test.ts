// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { db, queries, queryResponses, resetDb } from "../../test-support/db";

const slugValues: string[] = [];
const nanoid = mock(() => slugValues.shift() ?? "generated-slug");
mock.module("./db.server", () => ({ db }));
mock.module("nanoid", () => ({ nanoid }));

const { processPendingBatch, ingestSingle, stageDataset } = await import(
	"./pipeline.server"
);
const { getBatchRoasts, getDashboardData, getRoastBySlug } = await import(
	"./roasts.server"
);

beforeEach(() => {
	resetDb();
	slugValues.length = 0;
	nanoid.mockClear();
});

describe("dashboard database boundary", () => {
	it("maps dashboard, batch, and detail rows", async () => {
		queryResponses.push({
			count: null,
			data: [
				{
					cost: { wasteUsd: 1.5 },
					created_at: "2026-07-18T00:00:00Z",
					findings: [{ rule: "leaked-secret" }],
					id: "one",
					score: 20,
					slug: "one",
					source: "live",
					status: "processing",
					tier: "Charcoal",
					title: "One",
				},
				{ id: "invalid" },
			],
		});
		const dashboard = await getDashboardData("user-id");
		expect(dashboard).toMatchObject({
			recent: [{ id: "one", source: "live", status: "processing" }],
			stats: { secretsCaught: 1, totalRoasts: 1, wasteUsd: 1.5 },
		});

		queryResponses.push({
			data: [
				{
					error: "Failed",
					id: "one",
					score: 0,
					slug: "one",
					status: "failed",
					tier: "Unknown",
					title: "One",
				},
				{ id: "invalid" },
			],
		});
		expect(await getBatchRoasts("batch", "user-id")).toEqual([
			{
				error: "Failed",
				id: "one",
				score: 0,
				slug: "one",
				status: "failed",
				tier: "Unknown",
				title: "One",
			},
		]);

		queryResponses.push({
			data: {
				cost: {
					monthlyProjectionUsd: 30,
					projectionAssumption: "daily",
					tokenSource: "measured",
					totalTokensIn: 10,
					totalTokensOut: 5,
					totalUsd: 1,
					wasteUsd: 0.5,
				},
				created_at: "2026-07-18T00:00:00Z",
				findings: [
					{
						category: "security",
						message: "Found",
						rule: "secret",
						severity: 3,
					},
					{ detail: "Fallback detail" },
				],
				id: "one",
				roast_line: "Verdict",
				score: 20,
				slug: "one",
				source: "invalid",
				status: "done",
				tier: "Charcoal",
				title: "One",
			},
		});
		expect(await getRoastBySlug("one")).toMatchObject({
			cost: { tokenSource: "measured" },
			findings: [
				{ id: "secret-0", message: "Found" },
				{ id: "finding-1", message: "Fallback detail" },
			],
			roastLine: "Verdict",
			source: "upload",
		});
	});

	it("propagates query errors and handles missing detail rows", async () => {
		queryResponses.push({ error: { message: "dashboard" } });
		await expect(getDashboardData("user")).rejects.toThrow(
			"Could not load roasts: dashboard",
		);
		queryResponses.push({ error: { message: "batch" } });
		await expect(getBatchRoasts("batch", "user")).rejects.toThrow(
			"Could not load batch: batch",
		);
		queryResponses.push({ error: { message: "detail" } });
		await expect(getRoastBySlug("one")).rejects.toThrow(
			"Could not load roast: detail",
		);
		queryResponses.push({ data: null });
		expect(await getRoastBySlug("missing")).toBeNull();
	});
});

describe("ingest persistence pipeline", () => {
	it("redacts, titles, and stages multi-trace datasets", async () => {
		slugValues.push("one", "two");
		queryResponses.push({});
		const result = await stageDataset({
			source: "synthetic",
			title: "Key sk-FAKE000000000000000000000000",
			traces: [{ title: "Trace" }, { workflow: "Second" }],
			userId: "user",
		});
		expect(result).toEqual({
			batchId: expect.any(String),
			slugs: ["one", "two"],
		});
		const inserted = queries[0]?.calls.find(
			([method]) => method === "insert",
		)?.[1][0];
		expect(JSON.stringify(inserted)).not.toContain("sk-FAKE");

		queryResponses.push({ error: { message: "insert failed" } });
		await expect(stageDataset({ traces: [{}], userId: null })).rejects.toThrow(
			"Could not stage traces: insert failed",
		);
	});

	it("processes owned and anonymous rows and records failures", async () => {
		queryResponses.push({
			data: [
				{ findings: [], id: "one", raw_trace: {}, slug: "one" },
				{ findings: null, id: "two", raw_trace: {}, slug: "two" },
				"invalid",
				{ id: "invalid" },
			],
		});
		queryResponses.push({ error: { message: "update failed" } }, {});
		queryResponses.push({ throwOn: "update", throwValue: "boom" }, {});
		await processPendingBatch("batch", "user");
		expect(
			queries.some(({ calls }) =>
				calls.some(
					([method, args]) =>
						method === "update" &&
						JSON.stringify(args[0]).includes("Trace processing failed"),
				),
			),
		).toBe(true);

		queryResponses.push({
			data: [{ findings: [], id: "three", raw_trace: {}, slug: "three" }],
		});
		queryResponses.push({});
		await processPendingBatch("batch", null);
		expect(
			queries.some(({ calls }) =>
				calls.some(
					([method, args]) => method === "is" && args[0] === "user_id",
				),
			),
		).toBe(true);

		queryResponses.push({ error: { message: "load failed" } });
		await expect(processPendingBatch("batch", null)).rejects.toThrow(
			"Could not load batch: load failed",
		);
	});

	it("runs single-trace ingest and rejects an empty generated slug", async () => {
		slugValues.push("single");
		queryResponses.push({}, { data: [] });
		expect(
			await ingestSingle({ source: "upload", title: "One", trace: {} }),
		).toEqual({ slug: "single" });

		slugValues.push("");
		queryResponses.push({}, { data: [] });
		await expect(ingestSingle({ source: "upload", trace: {} })).rejects.toThrow(
			"Trace was not staged.",
		);
	});
});
