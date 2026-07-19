// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

if (typeof document === "undefined") {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://helix.test/app/new",
	});
	for (const key of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Node",
		"Event",
		"MouseEvent",
		"MutationObserver",
	] as const) {
		Object.defineProperty(globalThis, key, {
			configurable: true,
			value: dom.window[key],
		});
	}
}

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
		getAuthenticatedUser: vi.fn(),
		getSupabaseAuthClient: vi.fn(),
		requireAccessToken: vi.fn(),
		requireAuthenticatedUser: vi.fn(),
	},
	routes: new Map<string, { options: Record<string, unknown> }>(),
	navigate: vi.fn(),
	routeData: [] as unknown,
	routeParams: {} as Record<string, string>,
	server: {
		getRequestUrl: vi.fn(() => new URL("https://helix.test/login")),
		setResponseHeader: vi.fn(),
	},
};

const providerAuth = {
	exchangeCodeForSession: vi.fn(),
	resetPasswordForEmail: vi.fn(),
	signInWithPassword: vi.fn(),
	signOut: vi.fn(),
	signUp: vi.fn(),
	updateUser: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: (path: string) => (options: Record<string, unknown>) => {
		const route = {
			options,
			useLoaderData: () => state.routeData,
			useParams: () => state.routeParams,
			useRouteContext: () => ({ user: { email: "user@helix.test" } }),
		};
		state.routes.set(path, route);
		return route;
	},
	lazyRouteComponent: () => () => null,
	Link: ({ children }: { children?: React.ReactNode }) => (
		<a href="/">{children}</a>
	),
	Outlet: () => null,
	getRouteApi: () => ({
		useLoaderData: () => state.routeData,
		useRouteContext: () => ({ user: { email: "user@helix.test" } }),
	}),
	redirect: (options: unknown) => ({ options }),
	useNavigate: () => state.navigate,
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
vi.mock("@tanstack/react-start/server", () => state.server);

const appModule = await import("./app");
const authFunctions = await import("../lib/auth.functions");
const batchModule = await import("./app.scans.batches.$batch");
const { createUpload } = await import("./app.new");
const { loadBatch } = await import("../lib/roast-functions");
const apiIngestModule = await import("./api.ingest");
await import("./app.new");
const sharesFunctions = await import("../lib/shares.functions");
const { ShareDialog: DefaultShareDialog } = await import(
	"../components/ShareDialog"
);
const { getPublicRoast, getRecentPublicRoasts } = await import(
	"../lib/public-roasts.functions"
);
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
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
	for (const fn of Object.values(providerAuth)) fn.mockReset();
	for (const fn of Object.values(state.server)) fn.mockReset();
	state.navigate.mockReset();
	state.routeData = [];
	state.routeParams = {};
	state.auth.requireAccessToken.mockResolvedValue("access-token");
	state.auth.getAuthenticatedUser.mockResolvedValue({
		id: "user-id",
		email: "user@helix.test",
	});
	state.server.getRequestUrl.mockReturnValue(
		new URL("https://helix.test/login"),
	);
	state.auth.getAccessToken.mockResolvedValue(null);
	state.auth.getSupabaseAuthClient.mockReturnValue({ auth: providerAuth });
	state.auth.requireAuthenticatedUser.mockResolvedValue({ id: "user-id" });
	state.api.getMyRoasts.mockResolvedValue([]);
	state.api.getRecentRoasts.mockResolvedValue([]);
	delete process.env.INGEST_TOKEN;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("frontend FastAPI server functions", () => {
	test("maps each auth provider operation without exposing session data", async () => {
		providerAuth.signUp.mockResolvedValue({
			data: { session: null },
			error: null,
		});
		providerAuth.signInWithPassword.mockResolvedValue({ error: null });
		providerAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
		providerAuth.exchangeCodeForSession.mockResolvedValue({ error: null });
		providerAuth.updateUser.mockResolvedValue({ error: null });
		providerAuth.signOut.mockResolvedValue({ error: null });
		const credentials = { email: "user@example.com", password: "password" };
		await expect(authFunctions.signUp({ data: credentials })).resolves.toEqual({
			needsEmailConfirmation: true,
			ok: true,
		});
		await expect(authFunctions.logIn({ data: credentials })).resolves.toEqual({
			ok: true,
		});
		await expect(
			authFunctions.requestPasswordReset({
				data: { email: credentials.email },
			}),
		).resolves.toEqual({ ok: true });
		await expect(
			authFunctions.exchangePasswordRecoveryCode({
				data: { code: "recovery" },
			}),
		).resolves.toEqual({ ok: true });
		await expect(
			authFunctions.updatePassword({
				data: { password: credentials.password },
			}),
		).resolves.toEqual({ ok: true });
		await expect(authFunctions.logOut()).resolves.toEqual({ ok: true });
	});

	test("returns provider errors and a null current user", async () => {
		providerAuth.signUp.mockResolvedValue({ error: { message: "taken" } });
		providerAuth.signInWithPassword.mockResolvedValue({
			error: { message: "bad login" },
		});
		providerAuth.resetPasswordForEmail.mockResolvedValue({
			error: { message: "bad reset" },
		});
		providerAuth.exchangeCodeForSession.mockResolvedValue({
			error: { message: "bad code" },
		});
		providerAuth.updateUser.mockResolvedValue({
			error: { message: "bad password" },
		});
		providerAuth.signOut.mockResolvedValue({
			error: { message: "bad logout" },
		});
		const credentials = { email: "user@example.com", password: "password" };
		await expect(authFunctions.signUp({ data: credentials })).resolves.toEqual({
			error: "taken",
			ok: false,
		});
		await expect(authFunctions.logIn({ data: credentials })).resolves.toEqual({
			error: "bad login",
			ok: false,
		});
		await expect(
			authFunctions.requestPasswordReset({
				data: { email: credentials.email },
			}),
		).resolves.toEqual({ error: "bad reset", ok: false });
		await expect(
			authFunctions.exchangePasswordRecoveryCode({
				data: { code: "recovery" },
			}),
		).resolves.toEqual({ error: "bad code", ok: false });
		await expect(
			authFunctions.updatePassword({
				data: { password: credentials.password },
			}),
		).resolves.toEqual({ error: "bad password", ok: false });
		await expect(authFunctions.logOut()).resolves.toEqual({
			error: "bad logout",
			ok: false,
		});
		state.auth.getAuthenticatedUser.mockRejectedValueOnce(new Error("expired"));
		await expect(authFunctions.getCurrentUser()).resolves.toBeNull();
	});

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

	test("rejects malformed batch ids before touching FastAPI", async () => {
		expect(() => loadBatch({ data: { batchId: "wrong" } })).toThrow(
			"Invalid batch id.",
		);
		expect(state.api.getMyRoasts).not.toHaveBeenCalled();
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

	test("guards app shell and exposes its private metadata", async () => {
		const appRoute = appModule.Route as unknown as {
			options: {
				beforeLoad: () => Promise<unknown>;
				head: () => { meta: Array<{ content: string }> };
				loader: () => Promise<unknown>;
			};
		};
		expect(appRoute.options.head().meta[0]?.content).toBe("noindex, nofollow");
		await expect(appRoute.options.beforeLoad()).resolves.toEqual({
			user: { email: "user@helix.test", id: "user-id" },
		});
		state.auth.getAuthenticatedUser.mockResolvedValueOnce(null);
		await expect(appRoute.options.beforeLoad()).rejects.toMatchObject({
			options: { to: "/login" },
		});
		state.api.getMyRoasts.mockResolvedValue([]);
		await expect(appRoute.options.loader()).resolves.toMatchObject({
			roasts: [],
			stats: { totalRoasts: 0 },
		});
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
		expect(state.server.setResponseHeader).toHaveBeenCalledWith(
			"Cache-Control",
			"private, no-store",
		);
		expect(state.server.setResponseHeader).toHaveBeenCalledWith(
			"Vary",
			"Cookie",
		);
		state.server.setResponseHeader.mockClear();

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
		expect(state.server.setResponseHeader).toHaveBeenCalledTimes(2);
		expect(state.server.setResponseHeader).toHaveBeenCalledWith(
			"Cache-Control",
			"private, no-store",
		);
		expect(state.server.setResponseHeader).toHaveBeenCalledWith(
			"Vary",
			"Cookie",
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

	test("returns truthful unavailable public data when FastAPI cannot respond", async () => {
		state.api.getRecentRoasts.mockRejectedValueOnce(new Error("offline"));
		await expect(getRecentPublicRoasts()).resolves.toEqual({
			available: false,
			roasts: [],
		});
		state.api.getRoast.mockRejectedValueOnce(new Error("offline"));
		await expect(getPublicRoast({ data: ownerRoast.slug })).resolves.toBeNull();
	});

	test("drops unavailable credentials and malformed public responses safely", async () => {
		state.auth.getAccessToken.mockRejectedValueOnce(new Error("expired"));
		state.api.getRoast.mockResolvedValueOnce({
			...ownerRoast,
			detailed_report: {
				actions: [],
				generated: false,
				model: null,
				summary: "Public.",
			},
			is_owner: false,
			normalized: { spans: [], trace_id: "trace", workflow: "test" },
			roast_line: null,
			visibility: "public",
		});
		await expect(
			getPublicRoast({ data: ownerRoast.slug }),
		).resolves.toMatchObject({
			slug: ownerRoast.slug,
		});

		state.auth.getAccessToken.mockResolvedValueOnce("access-token");
		state.api.getRoast
			.mockRejectedValueOnce(new Error("expired"))
			.mockRejectedValueOnce(new Error("public retry failed"));
		await expect(getPublicRoast({ data: ownerRoast.slug })).resolves.toBeNull();
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
			request: new Request("https://helix.test/api/ingest", {
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

	test("rejects unconfigured, unauthorized, malformed, and failed ingest requests", async () => {
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
		const send = (body: BodyInit | null, authorization?: string) =>
			handler({
				request: new Request("https://helix.test/api/ingest", {
					body,
					headers: authorization ? { authorization } : {},
					method: "POST",
				}),
			});
		expect((await send("{}")).status).toBe(503);
		process.env.INGEST_TOKEN = "token";
		expect((await send("{}", "Bearer wrong")).status).toBe(401);
		expect((await send("not-json", "Bearer token")).status).toBe(400);
		expect(
			(await send(JSON.stringify({ trace: [] }), "Bearer token")).status,
		).toBe(400);
		expect(
			(
				await send(
					JSON.stringify({ trace: {}, title: "x".repeat(121) }),
					"Bearer token",
				)
			).status,
		).toBe(400);
		state.api.ingestTrace.mockRejectedValueOnce(new Error("offline"));
		expect(
			(await send(JSON.stringify({ trace: {} }), "Bearer token")).status,
		).toBe(500);
	});
});

describe("sharing server functions", () => {
	test("uses only the authenticated bearer token and returns validated sharing data", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = vi.fn(() =>
			Promise.resolve(Response.json({ visibility: "private", shares: [] })),
		);
		globalThis.fetch = fetchMock as typeof fetch;
		try {
			await expect(
				sharesFunctions.getRoastSharing({ data: "trace_1" }),
			).resolves.toBeTruthy();
			await expect(
				sharesFunctions.updateRoastVisibility({
					data: { slug: "trace_1", visibility: "public" },
				}),
			).resolves.toBeTruthy();
			await expect(
				sharesFunctions.addRoastShare({
					data: { slug: "trace_1", email: "person@company.com" },
				}),
			).resolves.toBeTruthy();
			await expect(
				sharesFunctions.removeRoastShare({
					data: { slug: "trace_1", email: "person@company.com" },
				}),
			).resolves.toBeTruthy();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("keeps sharing backend errors safe and specific", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as typeof fetch;
		try {
			fetchMock.mockResolvedValueOnce(
				Response.json(
					{ detail: "Only the owner can share this report." },
					{ status: 403 },
				),
			);
			await expect(
				sharesFunctions.getRoastSharing({ data: "trace_1" }),
			).rejects.toThrow("Only the owner can share this report.");
			fetchMock.mockResolvedValueOnce(new Response("offline", { status: 502 }));
			await expect(
				sharesFunctions.getRoastSharing({ data: "trace_1" }),
			).rejects.toThrow("Sharing request could not be completed.");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("loads default dialog actions only when the owner uses them", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = vi.fn(() =>
			Promise.resolve(
				Response.json({
					visibility: "public",
					shares: [
						{ email: "person@example.com", created_at: "2026-07-19T00:00:00Z" },
					],
				}),
			),
		);
		globalThis.fetch = fetchMock as typeof fetch;
		try {
			const view = render(<DefaultShareDialog slug="trace_1" isOwner />);
			Object.defineProperty(
				view.container.querySelector("dialog"),
				"showModal",
				{
					configurable: true,
					value(this: HTMLDialogElement) {
						this.setAttribute("open", "");
					},
				},
			);
			fireEvent.click(view.getByRole("button", { name: "Share report" }));
			await view.findByText("person@example.com");
			fireEvent.change(view.getByLabelText("Email address"), {
				target: { value: "next@example.com" },
			});
			fireEvent.click(view.getByRole("button", { name: "Add" }));
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
			fireEvent.click(view.getByRole("button", { name: "Private" }));
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
			fireEvent.click(
				view.getByRole("button", { name: "Remove person@example.com" }),
			);
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("scan route components", () => {
	test("submits pasted traces and shows validation errors", async () => {
		state.api.ingestBatch.mockResolvedValue({
			batch_id: "123e4567-e89b-42d3-a456-426614174000",
			results: [{ error: null, slug: "one", status: "done" }],
		});
		const NewRoast = state.routes.get("/app/new")?.options
			.component as () => JSX.Element;
		const view = render(<NewRoast />);
		fireEvent.change(view.getByPlaceholderText("Production support agent"), {
			target: { value: "Production" },
		});
		fireEvent.change(view.getByLabelText("Trace JSON or JSONL"), {
			target: { value: "{}" },
		});
		fireEvent.click(view.getByRole("button", { name: "Scan traces" }));
		await waitFor(() =>
			expect(state.navigate).toHaveBeenCalledWith({
				to: "/app/scans/batches/$batch",
				params: { batch: "123e4567-e89b-42d3-a456-426614174000" },
			}),
		);
		fireEvent.click(view.getByRole("tab", { name: "Upload file" }));
		expect(view.getByText("Choose JSON or JSONL file")).toBeTruthy();
		fireEvent.click(view.getByRole("tab", { name: "Paste JSON" }));
		fireEvent.change(view.getByLabelText("Trace JSON or JSONL"), {
			target: { value: "not json" },
		});
		fireEvent.click(view.getByRole("button", { name: "Scan traces" }));
		await view.findByRole("alert");
		fireEvent.click(view.getByRole("tab", { name: "Upload file" }));
		const fileInput = view.container.querySelector(
			"input[type=file]",
		) as HTMLInputElement;
		Object.defineProperty(fileInput, "files", {
			configurable: true,
			value: [],
		});
		fireEvent.change(fileInput);
		Object.defineProperty(fileInput, "files", {
			configurable: true,
			value: [{ name: "trace.json", text: async () => "{}" }],
		});
		fireEvent.change(fileInput);
		await waitFor(() => expect(view.getByText("trace.json")).toBeTruthy());
		fireEvent.click(view.getByRole("tab", { name: "Paste JSON" }));
		state.api.ingestBatch.mockRejectedValueOnce("offline");
		fireEvent.change(view.getByLabelText("Trace JSON or JSONL"), {
			target: { value: "{}" },
		});
		fireEvent.click(view.getByRole("button", { name: "Scan traces" }));
		await waitFor(() =>
			expect(view.getByRole("alert").textContent).toContain(
				"Could not upload traces.",
			),
		);
	});

	test("renders the authenticated app layout", () => {
		const AppLayout = state.routes.get("/app")?.options
			.component as () => JSX.Element;
		state.routeData = { stats: { totalRoasts: 8 } };
		const view = render(<AppLayout />);
		expect(view.container.textContent).toContain("8");
	});

	test("reports polling failures while a batch is processing", async () => {
		const BatchStatus = state.routes.get("/app/scans/batches/$batch")?.options
			.component as () => JSX.Element;
		state.routeParams = { batch: "123e4567-e89b-42d3-a456-426614174000" };
		state.routeData = [
			{
				id: "processing",
				slug: "one",
				title: "Queued",
				status: "processing",
				score: 0,
				error: null,
				findingCounts: { critical: 0, warning: 0, notice: 0 },
			},
		];
		state.api.getMyRoasts.mockRejectedValueOnce(new Error("offline"));
		const originalSetInterval = window.setInterval;
		let poll: (() => Promise<void>) | undefined;
		Object.defineProperty(window, "setInterval", {
			configurable: true,
			value: (callback: () => Promise<void>) => {
				poll = callback;
				return 1;
			},
		});
		try {
			const view = render(<BatchStatus />);
			await poll?.();
			await waitFor(() =>
				expect(view.getByRole("alert").textContent).toContain(
					"Could not refresh batch status.",
				),
			);
		} finally {
			Object.defineProperty(window, "setInterval", {
				configurable: true,
				value: originalSetInterval,
			});
		}
	});

	test("renders each batch status and takes single completed scans to their report", async () => {
		const BatchStatus = state.routes.get("/app/scans/batches/$batch")?.options
			.component as () => JSX.Element;
		state.routeParams = { batch: "123e4567-e89b-42d3-a456-426614174000" };
		state.routeData = [
			{
				id: "processing",
				slug: "one",
				title: "Queued",
				status: "processing",
				score: 0,
				error: null,
				findingCounts: { critical: 0, warning: 0, notice: 0 },
			},
			{
				id: "failed",
				slug: "two",
				title: "Broken",
				status: "failed",
				score: 0,
				error: "Bad trace",
				findingCounts: { critical: 0, warning: 0, notice: 0 },
			},
			{
				id: "done",
				slug: "three",
				title: "Ready",
				status: "done",
				score: 99,
				error: null,
				findingCounts: { critical: 1, warning: 0, notice: 0 },
			},
		];
		const view = render(<BatchStatus />);
		expect(view.getByLabelText("Processing")).toBeTruthy();
		expect(view.getByText("Bad trace")).toBeTruthy();
		expect(view.getByText("Helix score 99")).toBeTruthy();
		view.unmount();
		state.routeData = [
			{
				id: "done",
				slug: "three",
				title: "Ready",
				status: "done",
				score: 99,
				error: null,
				findingCounts: { critical: 0, warning: 0, notice: 0 },
			},
		];
		render(<BatchStatus />);
		await waitFor(() =>
			expect(state.navigate).toHaveBeenCalledWith({
				to: "/app/scans/$slug",
				params: { slug: "three" },
			}),
		);
	});

	test("shows a truthful empty state when a batch has no rows", () => {
		const BatchStatus = state.routes.get("/app/scans/batches/$batch")?.options
			.component as () => JSX.Element;
		state.routeParams = { batch: "123e4567-e89b-42d3-a456-426614174000" };
		state.routeData = [];
		const view = render(<BatchStatus />);
		expect(view.getByText("Batch not found.")).toBeTruthy();
	});
});
