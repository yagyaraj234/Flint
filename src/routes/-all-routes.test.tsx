import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = {
	api: {
		getMyRoasts: vi.fn(),
		getRecentRoasts: vi.fn(),
		getRoast: vi.fn(),
		ingestBatch: vi.fn(),
		ingestTrace: vi.fn(),
	},
	auth: {
		getAccessToken: vi.fn(),
		requireAccessToken: vi.fn(),
		requireAuthenticatedUser: vi.fn(),
	},
	routes: new Map<string, { options: Record<string, unknown> }>(),
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: (path: string) => (options: Record<string, unknown>) => {
		const route = { options };
		state.routes.set(path, route);
		return route;
	},
	lazyRouteComponent: () => () => null,
	redirect: (options: unknown) => ({ options }),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: ({ method = "GET" }: { method?: string } = {}) => {
		const build = (validator?: (value: unknown) => unknown) => ({
			handler(handler: (options: { data: unknown }) => unknown) {
				return Object.assign(
					(options: { data?: unknown } = {}) =>
						handler({
							data: validator ? validator(options.data) : options.data,
						}),
					{ method },
				);
			},
			validator(next: (value: unknown) => unknown) {
				return build(next);
			},
		});
		return build();
	},
}));

vi.mock("#/lib/api", () => state.api);
vi.mock("#/lib/supabase-auth.server", () => state.auth);

const appModule = await import("./app");
const batchModule = await import("./app.roasts.$batch");
const { createUpload } = await import("./app.new");
const apiIngestModule = await import("./api.ingest");
const { getPublicRoast, getRecentPublicRoasts } = await import(
	"../lib/public-roasts.functions"
);

const ownerRoast = {
	batch_id: "123e4567-e89b-42d3-a456-426614174000",
	cost: {
		monthly_projection_usd: 30,
		projection_assumption: "at 1,000 runs/day",
		token_source: "measured",
		total_tokens_in: 10,
		total_tokens_out: 5,
		total_usd: 1,
		unpriced_models: [],
		waste_usd: 1.25,
	},
	created_at: "2026-07-18T12:00:00.000Z",
	error: null,
	findings: [
		{
			category: "security",
			message: "Secret removed.",
			rule: "leaked-secret",
			severity: 3,
			span_ids: [],
		},
	],
	id: "owner-roast",
	score: 18,
	slug: "owner-roast",
	source: "upload",
	status: "done",
	tier: "Charcoal",
	title: "Owner roast",
} as const;

beforeEach(() => {
	for (const fn of Object.values(state.api)) fn.mockReset();
	for (const fn of Object.values(state.auth)) fn.mockReset();
	state.auth.requireAccessToken.mockResolvedValue("access-token");
	state.auth.getAccessToken.mockResolvedValue(null);
	state.auth.requireAuthenticatedUser.mockResolvedValue({ id: "user-id" });
	state.api.getMyRoasts.mockResolvedValue([]);
	state.api.getRecentRoasts.mockResolvedValue([]);
	delete process.env.INGEST_TOKEN;
});

afterEach(() => vi.restoreAllMocks());

describe("frontend FastAPI server functions", () => {
	test("creates an authenticated batch through FastAPI", async () => {
		state.api.ingestBatch.mockResolvedValue({
			batch_id: "123e4567-e89b-42d3-a456-426614174000",
			results: [{ error: null, slug: "one", status: "done" }],
		});

		await expect(
			createUpload({ data: { text: "{}", title: "Trace" } }),
		).resolves.toMatchObject({ batch_id: expect.any(String) });
		expect(state.api.ingestBatch).toHaveBeenCalledWith(
			{ title: "Trace", traces: [{}] },
			"access-token",
		);
	});

	test("rejects unauthenticated batch creation", async () => {
		state.auth.requireAuthenticatedUser.mockRejectedValue(
			new Error("Unauthorized."),
		);
		await expect(
			createUpload({ data: { text: "{}", title: "" } }),
		).rejects.toThrow("Unauthorized.");
	});

	test("maps owner rows for the dashboard with snake_case costs", async () => {
		state.api.getMyRoasts.mockResolvedValue([ownerRoast]);
		const appRoute = appModule.Route as unknown as {
			options: { loader: () => Promise<unknown> };
		};
		await expect(appRoute.options.loader()).resolves.toMatchObject({
			roasts: [
				{
					createdAt: ownerRoast.created_at,
					findingCounts: { critical: 1 },
				},
			],
			stats: { secretsCaught: 1, wasteUsd: 1.25 },
		});
		expect(state.api.getMyRoasts).toHaveBeenCalledWith("access-token");
	});

	test("loads owner batch rows through FastAPI", async () => {
		state.api.getMyRoasts.mockResolvedValue([ownerRoast]);
		const batchRoute = batchModule.Route as unknown as {
			options: {
				loader: (input: { params: { batch: string } }) => Promise<unknown>;
			};
		};
		await expect(
			batchRoute.options.loader({ params: { batch: ownerRoast.batch_id } }),
		).resolves.toEqual([
			expect.objectContaining({
				error: null,
				id: "owner-roast",
				status: "done",
			}),
		]);
		expect(state.api.getMyRoasts).toHaveBeenCalledWith(
			"access-token",
			ownerRoast.batch_id,
		);
	});
});

describe("public and ingest route boundaries", () => {
	test("maps public FastAPI DTOs and rejects invalid slugs", async () => {
		state.api.getRecentRoasts.mockResolvedValue([
			{
				created_at: ownerRoast.created_at,
				roast_line: null,
				score: ownerRoast.score,
				slug: ownerRoast.slug,
				status: "done",
				tier: ownerRoast.tier,
				title: ownerRoast.title,
			},
		]);
		expect(await getRecentPublicRoasts()).toMatchObject({
			available: true,
			roasts: [{ createdAt: ownerRoast.created_at, slug: ownerRoast.slug }],
		});

		expect(await getPublicRoast({ data: "bad slug" })).toBeNull();
		expect(state.api.getRoast).not.toHaveBeenCalled();

		state.auth.getAccessToken.mockResolvedValue("access-token");
		state.api.getRoast.mockResolvedValue({
			...ownerRoast,
			detailed_report: {
				summary: "Owner report.",
				actions: [],
				generated: false,
				model: null,
			},
			is_owner: true,
			normalized: { trace_id: "trace-1", workflow: "test", spans: [] },
			roast_line: null,
			visibility: "private",
		});
		await expect(
			getPublicRoast({ data: ownerRoast.slug }),
		).resolves.toMatchObject({ isOwner: true, visibility: "private" });
		expect(state.api.getRoast).toHaveBeenCalledWith(
			ownerRoast.slug,
			"access-token",
		);
	});

	test("retries rejected authenticated public reads without a token", async () => {
		state.auth.getAccessToken.mockResolvedValue("expired-token");
		state.api.getRoast
			.mockRejectedValueOnce(new Error("getRoast failed: 401"))
			.mockResolvedValueOnce({
				...ownerRoast,
				detailed_report: {
					summary: "Public report.",
					actions: [],
					generated: false,
					model: null,
				},
				is_owner: false,
				normalized: { trace_id: "trace-1", workflow: "test", spans: [] },
				roast_line: null,
				visibility: "public",
			});

		await expect(
			getPublicRoast({ data: ownerRoast.slug }),
		).resolves.toMatchObject({ slug: ownerRoast.slug });
		expect(state.api.getRoast).toHaveBeenNthCalledWith(
			1,
			ownerRoast.slug,
			"expired-token",
		);
		expect(state.api.getRoast).toHaveBeenNthCalledWith(2, ownerRoast.slug);
	});

	test("forwards the authenticated ingest endpoint payload to FastAPI", async () => {
		process.env.INGEST_TOKEN = "ingest-token";
		state.api.ingestTrace.mockResolvedValue({ slug: "live-scan" });
		const handler = (
			apiIngestModule.Route as unknown as {
				options: {
					server: {
						handlers: {
							POST: (input: { request: Request }) => Promise<Response>;
						};
					};
				};
			}
		).options.server.handlers.POST;
		const response = await handler({
			request: new Request("https://roast0.test/api/ingest", {
				body: JSON.stringify({
					format: "generic",
					source: "live",
					title: " New ",
					trace: {},
				}),
				headers: {
					authorization: "Bearer ingest-token",
					"content-type": "application/json",
				},
				method: "POST",
			}),
		});
		expect(response.status).toBe(201);
		expect(state.api.ingestTrace).toHaveBeenCalledWith({
			format: "generic",
			source: "live",
			title: "New",
			trace: {},
		});
	});
});
