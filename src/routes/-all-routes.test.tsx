import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
} from "bun:test";
// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM, VirtualConsole } from "jsdom";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	db,
	queries,
	queryResponses,
	resetDb,
	setDbError,
} from "../../test-support/db";

if (typeof document === "undefined") {
	const virtualConsole = new VirtualConsole().forwardTo(console, {
		jsdomErrors: ["css-parsing", "resource-loading", "unhandled-exception"],
	});
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://roast0.test/r/hot-one",
		virtualConsole,
	});
	for (const key of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"SVGElement",
		"Node",
		"Event",
		"MouseEvent",
		"DOMException",
		"MutationObserver",
	] as const) {
		Object.defineProperty(globalThis, key, {
			configurable: true,
			value: dom.window[key],
		});
	}
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	value: true,
	writable: true,
});

type RouteOptions = Record<string, unknown>;
type TestRoute = {
	_addFileChildren(children: Record<string, TestRoute>): TestRoute;
	_addFileTypes(): TestRoute;
	addChildren(children: TestRoute[]): TestRoute;
	options: RouteOptions;
	path: string;
	update(options: { getParentRoute?: () => TestRoute }): TestRoute;
	useLoaderData(): unknown;
	useParams(): unknown;
	useRouteContext(): unknown;
	useSearch(): unknown;
};

const routeData = new Map<string, unknown>();
const routeParams = new Map<string, unknown>();
const routeContexts = new Map<string, unknown>();
const routeSearch = new Map<string, unknown>();
const routes = new Map<string, TestRoute>();
const appLoaderData = {
	recent: [],
	roasts: [],
	stats: {
		secretsCaught: 0,
		totalRoasts: 0,
		wasteUsd: 0,
		worstScoreThisWeek: null as number | null,
	},
};
let appContext = { user: { email: "user@example.com", id: "user-id" } };

function makeRoute(path: string, options: RouteOptions): TestRoute {
	const route: TestRoute = {
		_addFileChildren: () => route,
		_addFileTypes: () => route,
		addChildren: () => route,
		options,
		path,
		update(updateOptions) {
			updateOptions.getParentRoute?.();
			return route;
		},
		useLoaderData: () => routeData.get(path),
		useParams: () => routeParams.get(path),
		useRouteContext: () => routeContexts.get(path),
		useSearch: () => routeSearch.get(path),
	};
	routes.set(path, route);
	return route;
}

const createFileRoute = (path: string) => (options: RouteOptions) =>
	makeRoute(path, options);
const createRootRoute = (options: RouteOptions) => makeRoute("__root", options);
const navigate = mock(() => Promise.resolve());
const createRouter = mock((options: unknown) => ({ options }));
const redirect = (options: unknown) => ({ options, status: 307 });
const notFound = () => ({ isNotFound: true });
const Link = ({
	children,
	to,
	...props
}: {
	children: ReactNode;
	to: string;
}) => {
	const {
		activeOptions: _activeOptions,
		activeProps: _activeProps,
		params: _params,
		search: _search,
		...anchorProps
	} = props as Record<string, unknown>;
	return (
		<a href={to} {...anchorProps}>
			{children}
		</a>
	);
};
let outletChild: ReactNode = <div>Nested route</div>;
const Outlet = () => <>{outletChild}</>;
const HeadContent = () => <meta data-testid="head-content" />;
const Scripts = () => <script data-testid="scripts" />;

mock.module("@tanstack/react-router", () => ({
	createFileRoute,
	createRootRoute,
	createRouter,
	getRouteApi: () => ({
		useLoaderData: () => appLoaderData,
		useRouteContext: () => appContext,
	}),
	HeadContent,
	Link,
	notFound,
	Outlet,
	redirect,
	RouterProvider: Outlet,
	Scripts,
	useNavigate: () => navigate,
}));

function createServerFn({ method = "GET" }: { method?: string } = {}) {
	const build = (validator?: (value: unknown) => unknown) => ({
		handler(handler: (options: { data: unknown }) => unknown) {
			return Object.assign(
				(options: { data?: unknown } = {}) =>
					handler({ data: validator ? validator(options.data) : options.data }),
				{ method },
			);
		},
		validator(next: (value: unknown) => unknown) {
			return build(next);
		},
	});
	return build();
}
mock.module("@tanstack/react-start", () => ({ createServerFn }));
mock.module("../shells.css?url", () => ({ default: "/shells.css" }));
mock.module("../styles.css?url", () => ({ default: "/styles.css" }));

const auth = {
	exchangeCodeForSession: mock(),
	getUser: mock(),
	resetPasswordForEmail: mock(),
	signInWithPassword: mock(),
	signOut: mock(),
	signUp: mock(),
	updateUser: mock(),
};
const authClient = { auth };
const createServerClient = mock(() => authClient);
const getCookies = mock(() => ({ session: "cookie" }));
const getRequestUrl = mock(() => "https://roast0.test/reset-password");
const setCookie = mock();
const setResponseHeader = mock();
mock.module("@supabase/ssr", () => ({ createServerClient }));
mock.module("@tanstack/react-start/server", () => ({
	getCookies,
	getRequestUrl,
	setCookie,
	setResponseHeader,
}));
mock.module("#/lib/db.server", () => ({ db }));

const { act, cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { AppPage, AppShell, useAppSearch } = await import(
	"../components/app-shell"
);
const { AuthShell } = await import("../components/auth-shell");

const { getCurrentUser } = await import("../lib/auth.functions");
const { getPublicRoast, getRecentPublicRoasts } = await import(
	"../lib/public-roasts.functions"
);
const {
	getAuthenticatedUser,
	getSupabaseAuthClient,
	requireAuthenticatedUser,
} = await import("../lib/supabase-auth.server");
const rootModule = await import("./__root");
const landingModule = await import("./index");
const analyzerModule = await import("./ai-agent-trace-analyzer");
const loginModule = await import("./login");
const signupModule = await import("./signup");
const resetModule = await import("./reset-password");
const updateModule = await import("./update-password");
const appModule = await import("./app");
const dashboardModule = await import("./app.index");
const newModule = await import("./app.new");
const roastsLayoutModule = await import("./app.roasts");
const roastsModule = await import("./app.roasts.index");
const batchModule = await import("./app.roasts.$batch");
const profileModule = await import("./app.profile");
const publicModule = await import("./r/$slug");
const apiModule = await import("./api.ingest");
const robotsModule = await import("./robots[.]txt");
const sitemapModule = await import("./sitemap[.]xml");
const routerModule = await import("../router");

const originalEnv = {
	INGEST_TOKEN: process.env.INGEST_TOKEN,
	NODE_ENV: process.env.NODE_ENV,
	SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
	SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
	SUPABASE_URL: process.env.SUPABASE_URL,
};

function component(value: unknown) {
	const route = value as TestRoute;
	const Component = route.options.component as () => ReactNode;
	return <Component />;
}

function setField(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(buttonName: string) {
	const form = screen.getByRole("button", { name: buttonName }).closest("form");
	if (!form) throw new Error(`No form for ${buttonName}`);
	fireEvent.submit(form);
}

function validRoast() {
	return {
		cost: {
			monthlyProjectionUsd: 30,
			projectionAssumption: "daily",
			tokenSource: "measured" as const,
			totalTokensIn: 10,
			totalTokensOut: 5,
			totalUsd: 1,
			wasteUsd: 0.5,
		},
		createdAt: "2026-07-18T00:00:00Z",
		findings: [],
		roastLine: "Verdict",
		score: 80,
		slug: "hot-one",
		source: "upload",
		tier: "Medium",
		timeline: [],
		title: "Hot one",
	};
}

beforeEach(() => {
	cleanup();
	outletChild = <div>Nested route</div>;
	routeData.clear();
	routeParams.clear();
	routeContexts.clear();
	routeSearch.clear();
	resetDb();
	for (const fn of Object.values(auth)) fn.mockReset();
	createServerClient.mockClear();
	getCookies.mockClear();
	getRequestUrl.mockClear();
	navigate.mockReset();
	setCookie.mockClear();
	setResponseHeader.mockClear();
	navigate.mockResolvedValue(undefined);
	auth.getUser.mockResolvedValue({
		data: {
			user: { email: "user@example.com", id: "user-id" },
		},
	});
	process.env.SUPABASE_URL = "https://example.supabase.co";
	process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";
	Object.assign(appLoaderData, {
		recent: [],
		roasts: [],
		stats: {
			secretsCaught: 0,
			totalRoasts: 0,
			wasteUsd: 0,
			worstScoreThisWeek: null,
		},
	});
	appContext = { user: { email: "user@example.com", id: "user-id" } };
});

afterEach(() => cleanup());
afterAll(() => {
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("static, SEO, and router routes", () => {
	it("renders shared auth and app shell states", async () => {
		const { unmount } = render(
			<AuthShell title="Welcome">
				<p>Auth content</p>
			</AuthShell>,
		);
		expect(screen.getByText("Auth content")).toBeTruthy();
		unmount();

		render(<AuthShell title="Reset" />);
		expect(screen.getByLabelText("Roast0 home")).toBeTruthy();
		expect(document.querySelector(".auth-card__placeholder")).toBeTruthy();
		cleanup();

		function SearchProbe() {
			return <output>{useAppSearch() || "empty search"}</output>;
		}
		outletChild = <SearchProbe />;
		render(<AppShell totalRoasts={4} user={{ email: "u@test.dev" }} />);
		expect(screen.getByText("empty search")).toBeTruthy();
		fireEvent.change(screen.getByPlaceholderText("Search roasts"), {
			target: { value: "leaky" },
		});
		expect(await screen.findByText("leaky")).toBeTruthy();
		expect(screen.getByText("4")).toBeTruthy();
		const profileLink = document.querySelector<HTMLAnchorElement>(
			'.app-sidebar__nav a[href="/app/profile"]',
		);
		if (!profileLink) throw new Error("Missing sidebar Profile link");
		expect(profileLink.getAttribute("href")).toBe("/app/profile");
		expect(profileLink.tabIndex).toBe(0);
		cleanup();

		outletChild = <div>Nested route</div>;
		render(<AppShell totalRoasts={0} user={{ email: "" }} />);
		expect(screen.getAllByText("R").length).toBeGreaterThan(0);
		cleanup();

		render(<AppPage breadcrumb="Dashboard" title="Overview" />);
		expect(screen.getByLabelText("Overview content")).toBeTruthy();
	});

	it("renders root metadata, analyzer content, and router defaults", () => {
		const rootHead = (rootModule.Route.options.head as () => RouteOptions)();
		expect(rootHead.links).toHaveLength(7);
		const rootOptions = rootModule.Route.options as unknown as RouteOptions;
		const Shell = rootOptions.shellComponent as (props: {
			children: ReactNode;
		}) => ReactNode;
		expect(renderToStaticMarkup(<Shell>Root child</Shell>)).toContain(
			"Root child",
		);

		expect(
			(analyzerModule.Route.options.head as () => RouteOptions)().meta,
		).toHaveLength(9);
		render(component(analyzerModule.Route));
		expect(
			screen.getByRole("heading", {
				name: /AI agent trace analyzer for security/i,
			}),
		).toBeTruthy();
		expect(
			screen.getByText("What does an AI agent trace analyzer find?"),
		).toBeTruthy();
		for (const route of [
			appModule.Route,
			loginModule.Route,
			resetModule.Route,
			signupModule.Route,
			updateModule.Route,
		]) {
			expect((route.options.head as () => RouteOptions)().meta).toEqual([
				{ name: "robots", content: "noindex, nofollow" },
			]);
		}

		const router = routerModule.getRouter() as { options: RouteOptions };
		expect(router.options).toMatchObject({
			defaultPreload: "intent",
			defaultPreloadStaleTime: 0,
			scrollRestoration: true,
		});
	});

	it("serves robots and sitemap with only valid public roast rows", async () => {
		const robotsGet = (
			(robotsModule.Route.options.server as RouteOptions)
				.handlers as RouteOptions
		).GET as (options: { request: Request }) => Response;
		const robots = robotsGet({
			request: new Request("https://roast0.test/robots.txt"),
		});
		expect(await robots.text()).toContain(
			"Sitemap: https://roast0.test/sitemap.xml",
		);

		const sitemapGet = (
			(sitemapModule.Route.options.server as RouteOptions)
				.handlers as RouteOptions
		).GET as (options: { request: Request }) => Promise<Response>;
		queryResponses.push({
			data: [
				{ created_at: "2026-07-18", slug: "hot one" },
				{ created_at: 42, slug: "invalid" },
			],
		});
		let response = await sitemapGet({
			request: new Request("https://roast0.test/sitemap.xml"),
		});
		expect(await response.text()).toContain("/r/hot%20one");

		queryResponses.push({ error: { message: "offline" } });
		response = await sitemapGet({
			request: new Request("https://roast0.test/sitemap.xml"),
		});
		expect(await response.text()).not.toContain("/r/");
		setDbError(new Error("offline"));
		response = await sitemapGet({
			request: new Request("https://roast0.test/sitemap.xml"),
		});
		expect(response.status).toBe(200);
	});
});

describe("landing and public card routes", () => {
	it("guards landing, loads data, and renders live and empty walls", async () => {
		const beforeLoad = landingModule.Route.options
			.beforeLoad as () => Promise<void>;
		auth.getUser.mockResolvedValueOnce({ data: { user: null } });
		await expect(beforeLoad()).resolves.toBeUndefined();
		auth.getUser.mockResolvedValueOnce({ data: { user: { id: "user" } } });
		await expect(beforeLoad()).rejects.toMatchObject({
			options: { to: "/app" },
		});
		queryResponses.push({ data: [] });
		await (landingModule.Route.options.loader as () => Promise<unknown>)();
		const landingHead = (
			landingModule.Route.options.head as () => RouteOptions
		)();
		expect(landingHead.meta).toHaveLength(2);
		expect(landingHead.meta).toContainEqual({
			title: "Roast0 — Every trace tells on your agent",
		});

		queryResponses.push({ error: { message: "offline" } });
		expect(await getRecentPublicRoasts()).toEqual({
			available: false,
			roasts: [],
		});
		setDbError(new Error("offline"));
		expect(await getRecentPublicRoasts()).toEqual({
			available: false,
			roasts: [],
		});
		resetDb();

		routeData.set("/", {
			available: true,
			roasts: [
				{
					roastLine: null,
					score: 90,
					slug: "hot one",
					tier: "Rare",
					title: "Hot one",
				},
			],
		});
		const { unmount } = render(component(landingModule.Route));
		expect(screen.getByText("Database live")).toBeTruthy();
		expect(
			screen.getByText("This trace is waiting for its last word."),
		).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "See a live roast" })
				.getAttribute("href"),
		).toBe("/r/hot%20one");
		unmount();

		routeData.set("/", { available: false, roasts: [] });
		render(component(landingModule.Route));
		expect(screen.getByText("Live data unavailable")).toBeTruthy();
		expect(screen.getByText(/No public roasts yet/)).toBeTruthy();
	});

	it("loads, describes, renders, and rejects public roasts", async () => {
		const roast = validRoast();
		queryResponses.push({
			data: {
				cost: roast.cost,
				created_at: roast.createdAt,
				findings: roast.findings,
				normalized: { spans: roast.timeline },
				roast_line: roast.roastLine,
				score: roast.score,
				slug: roast.slug,
				source: roast.source,
				tier: roast.tier,
				title: roast.title,
			},
		});
		const loader = publicModule.Route.options.loader as (options: {
			params: { slug: string };
		}) => Promise<unknown>;
		expect(await loader({ params: { slug: "hot-one" } })).toEqual(roast);
		queryResponses.push({ data: null });
		await expect(loader({ params: { slug: "missing" } })).rejects.toEqual({
			isNotFound: true,
		});
		expect(await getPublicRoast({ data: "bad slug" })).toBeNull();
		queryResponses.push({ error: { message: "offline" } });
		expect(await getPublicRoast({ data: "valid" })).toBeNull();
		setDbError(new Error("offline"));
		expect(await getPublicRoast({ data: "valid" })).toBeNull();
		resetDb();

		const head = publicModule.Route.options.head as (options: {
			loaderData?: ReturnType<typeof validRoast>;
		}) => RouteOptions;
		expect(head({}).meta).toEqual([{ title: "Roast not found · Roast0" }]);
		expect(head({ loaderData: roast }).meta).toHaveLength(9);

		routeData.set("/r/$slug", roast);
		const { unmount } = render(component(publicModule.Route));
		expect(
			screen.getByText("Roasted by Roast0 · agent trace intelligence"),
		).toBeTruthy();
		unmount();
		const NotFound = publicModule.Route.options
			.notFoundComponent as () => ReactNode;
		render(<NotFound />);
		expect(screen.getByText("This roast left the grill.")).toBeTruthy();
	});
});

describe("Supabase auth boundary", () => {
	it("requires config and wires secure cookies", () => {
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_PUBLISHABLE_KEY;
		delete process.env.SUPABASE_ANON_KEY;
		expect(() => getSupabaseAuthClient()).toThrow(
			"SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY",
		);

		process.env.SUPABASE_URL = "https://example.supabase.co";
		process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";
		process.env.NODE_ENV = "production";
		expect(getSupabaseAuthClient()).toBe(authClient);
		const options = createServerClient.mock.calls[0]?.[2] as {
			cookieOptions: { secure: boolean };
			cookies: {
				getAll(): Array<{ name: string; value: string }>;
				setAll(
					cookies: Array<{ name: string; options: object; value: string }>,
					headers: Record<string, string>,
				): void;
			};
		};
		expect(options.cookieOptions.secure).toBe(true);
		expect(options.cookies.getAll()).toEqual([
			{ name: "session", value: "cookie" },
		]);
		options.cookies.setAll(
			[{ name: "session", options: { httpOnly: true }, value: "next" }],
			{ "Set-Cookie": "session=next" },
		);
		expect(setCookie).toHaveBeenCalledWith("session", "next", {
			httpOnly: true,
		});

		delete process.env.SUPABASE_PUBLISHABLE_KEY;
		process.env.SUPABASE_ANON_KEY = "anon";
		process.env.NODE_ENV = "test";
		getSupabaseAuthClient();
		expect(createServerClient.mock.calls[1]?.[1]).toBe("anon");
		expect(
			(
				createServerClient.mock.calls[1]?.[2] as {
					cookieOptions: { secure: boolean };
				}
			).cookieOptions.secure,
		).toBe(false);
	});

	it("returns users without caching and rejects guests", async () => {
		auth.getUser
			.mockResolvedValueOnce({ data: { user: { id: "one" } } })
			.mockResolvedValueOnce({
				data: { user: { email: "user@example.com", id: "two" } },
			})
			.mockResolvedValueOnce({ data: { user: null } })
			.mockResolvedValueOnce({ data: { user: null } })
			.mockRejectedValueOnce(new Error("offline"));
		expect(await getAuthenticatedUser()).toEqual({ email: "", id: "one" });
		expect(await requireAuthenticatedUser()).toEqual({
			email: "user@example.com",
			id: "two",
		});
		expect(await getAuthenticatedUser()).toBeNull();
		await expect(requireAuthenticatedUser()).rejects.toThrow("Unauthorized.");
		expect(await getCurrentUser()).toBeNull();
		expect(setResponseHeader).toHaveBeenCalledWith(
			"Cache-Control",
			"private, no-store",
		);
	});
});

describe("auth page routes", () => {
	it("validates login and reports provider and transport failures", async () => {
		render(component(loginModule.Route));
		submit("Log in");
		expect(
			await screen.findByText("Enter a valid email address."),
		).toBeTruthy();
		setField("Email", "user@example.com");
		setField("Password", "password");

		auth.signInWithPassword.mockResolvedValueOnce({
			error: { message: "Bad login" },
		});
		submit("Log in");
		await screen.findByRole("alert");
		expect(screen.getByRole("alert").textContent).toBe("Bad login");

		auth.signInWithPassword.mockRejectedValueOnce(new Error("offline"));
		submit("Log in");
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Could not log in. Try again.",
		);

		let resolveLogin: (value: { error: null }) => void = () => {};
		auth.signInWithPassword.mockImplementationOnce(
			() => new Promise((resolve) => (resolveLogin = resolve)),
		);
		submit("Log in");
		expect(screen.getByRole("button", { name: "Logging in…" })).toBeTruthy();
		resolveLogin({ error: null });
		await waitFor(() =>
			expect(auth.signInWithPassword).toHaveBeenCalledTimes(3),
		);
	});

	it("handles signup validation, errors, direct sessions, and confirmation", async () => {
		render(component(signupModule.Route));
		submit("Start roasting");
		expect(
			await screen.findByText("Password must be at least 8 characters."),
		).toBeTruthy();
		setField("Email", "user@example.com");
		setField("Password", "password");
		setField("Confirm password", "password");
		auth.signUp.mockResolvedValueOnce({
			data: { session: null },
			error: { message: "Taken" },
		});
		submit("Start roasting");
		expect((await screen.findByRole("alert")).textContent).toBe("Taken");
		auth.signUp.mockRejectedValueOnce(new Error("offline"));
		submit("Start roasting");
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Could not create account. Try again.",
		);
		auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
		submit("Start roasting");
		expect(
			await screen.findByText("Open the confirmation link, then log in."),
		).toBeTruthy();
		cleanup();

		render(component(signupModule.Route));
		setField("Email", "user@example.com");
		setField("Password", "password");
		setField("Confirm password", "password");
		auth.signUp.mockResolvedValueOnce({ data: { session: {} }, error: null });
		submit("Start roasting");
		await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(4));
	});

	it("handles reset validation, failures, and sent state", async () => {
		render(component(resetModule.Route));
		submit("Send reset link");
		expect(
			await screen.findByText("Enter a valid email address."),
		).toBeTruthy();
		setField("Email", "user@example.com");
		auth.resetPasswordForEmail.mockResolvedValueOnce({
			error: { message: "No user" },
		});
		submit("Send reset link");
		expect((await screen.findByRole("alert")).textContent).toBe("No user");
		auth.resetPasswordForEmail.mockRejectedValueOnce(new Error("offline"));
		submit("Send reset link");
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Could not send reset email. Try again.",
		);
		auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
		submit("Send reset link");
		expect(await screen.findByText(/Use the link we sent/)).toBeTruthy();
	});

	it("exchanges recovery codes and updates valid matching passwords", async () => {
		const validateSearch = updateModule.Route.options.validateSearch as (
			search: Record<string, unknown>,
		) => unknown;
		expect(validateSearch({ code: "one" })).toEqual({ code: "one" });
		expect(validateSearch({ code: 1 })).toEqual({ code: undefined });
		const beforeLoad = updateModule.Route.options.beforeLoad as (options: {
			search: { code?: string };
		}) => Promise<unknown>;
		expect(await beforeLoad({ search: {} })).toEqual({ recoveryError: null });
		auth.exchangeCodeForSession.mockRejectedValueOnce(new Error("bad"));
		expect(await beforeLoad({ search: { code: "bad" } })).toEqual({
			recoveryError: "Invalid or expired recovery link.",
		});
		auth.exchangeCodeForSession.mockResolvedValueOnce({
			error: { message: "Expired" },
		});
		expect(await beforeLoad({ search: { code: "bad" } })).toEqual({
			recoveryError: "Expired",
		});
		auth.exchangeCodeForSession.mockResolvedValueOnce({ error: null });
		await expect(
			beforeLoad({ search: { code: "good" } }),
		).rejects.toMatchObject({
			options: { replace: true, to: "/update-password" },
		});

		routeContexts.set("/update-password", { recoveryError: "Initial error" });
		render(component(updateModule.Route));
		expect(screen.getByRole("alert").textContent).toBe("Initial error");
		submit("Update password");
		expect(
			await screen.findByText("Password must be at least 8 characters."),
		).toBeTruthy();
		setField("New password", "password");
		setField("Confirm password", "password");
		auth.updateUser.mockResolvedValueOnce({ error: { message: "Rejected" } });
		submit("Update password");
		expect((await screen.findByRole("alert")).textContent).toBe("Rejected");
		auth.updateUser.mockRejectedValueOnce(new Error("offline"));
		submit("Update password");
		expect((await screen.findByRole("alert")).textContent).toContain(
			"Request a new reset link",
		);
		auth.updateUser.mockResolvedValueOnce({ error: null });
		submit("Update password");
		await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(3));
	});
});

describe("authenticated app routes", () => {
	it("guards and loads the app shell", async () => {
		const beforeLoad = appModule.Route.options
			.beforeLoad as () => Promise<unknown>;
		auth.getUser.mockResolvedValueOnce({ data: { user: null } });
		await expect(beforeLoad()).rejects.toMatchObject({
			options: { to: "/login" },
		});
		auth.getUser.mockResolvedValueOnce({
			data: { user: { email: "user@example.com", id: "user" } },
		});
		expect(await beforeLoad()).toEqual({
			user: { email: "user@example.com", id: "user" },
		});
		queryResponses.push({ count: 2, data: [] });
		expect(
			await (appModule.Route.options.loader as () => Promise<unknown>)(),
		).toMatchObject({
			stats: { totalRoasts: 2 },
		});

		routeContexts.set("/app", appContext);
		routeData.set("/app", { stats: { totalRoasts: 2 } });
		render(component(appModule.Route));
		expect(screen.getByText("2")).toBeTruthy();
	});

	it("renders dashboard, roast list, layout, and profile", () => {
		Object.assign(appLoaderData, {
			recent: [
				{
					createdAt: "2026-07-18",
					id: "one",
					score: 12,
					slug: "one",
					source: "upload",
					status: "done",
					tier: "Charcoal",
					title: "One",
				},
			],
			roasts: [],
			stats: {
				secretsCaught: 3,
				totalRoasts: 1,
				wasteUsd: 1.25,
				worstScoreThisWeek: null,
			},
		});
		const { unmount } = render(component(dashboardModule.Route));
		expect(screen.getByText("$1.25")).toBeTruthy();
		expect(screen.getByText("—")).toBeTruthy();
		unmount();
		appLoaderData.stats.worstScoreThisWeek = 12;
		render(component(dashboardModule.Route));
		expect(screen.getAllByText("12").length).toBeGreaterThan(0);
		cleanup();

		render(component(roastsLayoutModule.Route));
		expect(screen.getByText("Nested route")).toBeTruthy();
		cleanup();
		render(component(roastsModule.Route));
		expect(screen.getByText("Nothing roasted yet")).toBeTruthy();
		cleanup();
		render(component(profileModule.Route));
		expect(screen.getByText("user@example.com")).toBeTruthy();
	});

	it("uses the shared page header for authenticated route hierarchy", () => {
		render(component(profileModule.Route));
		expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
		expect(document.querySelector(".app-page__breadcrumb")?.textContent).toBe(
			"Roast0 / Profile",
		);
		cleanup();

		render(component(newModule.Route));
		expect(
			screen.getByRole("heading", { name: "Roast new traces" }),
		).toBeTruthy();
		expect(
			screen.getByText(
				"Single object, array, or JSONL. Maximum 20 traces per upload.",
			),
		).toBeTruthy();
		expect(document.querySelector(".app-page__title-row")).toBeTruthy();
		cleanup();

		render(component(dashboardModule.Route));
		expect(screen.getByRole("link", { name: "New roast" })).toBeTruthy();
		expect(document.querySelector(".app-page__title-row > a")).toBeTruthy();
	});

	it("reports sign-out errors, exceptions, pending state, and success", async () => {
		auth.signOut.mockResolvedValueOnce({
			error: { message: "Session expired" },
		});
		render(component(profileModule.Route));
		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Session expired",
		);
		cleanup();

		auth.signOut.mockRejectedValueOnce(new Error("network"));
		render(component(profileModule.Route));
		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Could not sign out. Try again.",
		);
		cleanup();

		let resolveSignOut: (value: { error: null }) => void = () => {};
		auth.signOut.mockImplementationOnce(
			() =>
				new Promise<{ error: null }>((resolve) => {
					resolveSignOut = resolve;
				}),
		);
		render(component(profileModule.Route));
		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
		expect(
			(
				screen.getByRole("button", {
					name: "Signing out…",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		resolveSignOut({ error: null });
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(3));
	});

	it("stages pasted and uploaded trace files and reports errors", async () => {
		render(component(newModule.Route));
		submit("Roast traces");
		await screen.findByRole("alert");
		expect(screen.getByRole("alert").textContent).toContain("Paste JSON");

		setField("Title optional", "Trace");
		fireEvent.change(screen.getByLabelText("Trace JSON or JSONL"), {
			target: { value: "{}" },
		});
		queryResponses.push({});
		submit("Roast traces");
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				params: { batch: expect.any(String) },
				to: "/app/roasts/$batch",
			}),
		);

		setDbError("bad upload");
		submit("Roast traces");
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Could not upload traces.",
		);
		resetDb();

		fireEvent.click(screen.getByRole("tab", { name: "Upload file" }));
		expect(screen.getByRole("button", { name: "Roast traces" })).toBeTruthy();
		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		Object.defineProperty(fileInput, "files", {
			configurable: true,
			value: [],
		});
		fireEvent.change(fileInput);
		Object.defineProperty(fileInput, "files", {
			configurable: true,
			value: [{ name: "trace.json", text: mock(() => Promise.resolve("{}")) }],
		});
		fireEvent.change(fileInput);
		expect(await screen.findByText("trace.json")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Paste JSON" }));
		expect(screen.getByLabelText("Trace JSON or JSONL")).toBeTruthy();
	});

	it("loads and renders batch states, polling, failures, and navigation", async () => {
		const batchId = "123e4567-e89b-42d3-a456-426614174000";
		queryResponses.push({ data: [] });
		expect(
			await (
				batchModule.Route.options.loader as (options: {
					params: { batch: string };
				}) => Promise<unknown>
			)({ params: { batch: batchId } }),
		).toEqual([]);
		expect(() =>
			(
				batchModule.Route.options.loader as (options: {
					params: { batch: string };
				}) => Promise<unknown>
			)({ params: { batch: "bad" } }),
		).toThrow("Invalid batch id.");

		routeParams.set("/app/roasts/$batch", { batch: batchId });
		routeData.set("/app/roasts/$batch", []);
		const { unmount } = render(component(batchModule.Route));
		expect(screen.getByText("Batch not found.")).toBeTruthy();
		unmount();

		routeData.set("/app/roasts/$batch", [
			{
				error: null,
				id: "done",
				score: 90,
				slug: "done",
				status: "done",
				tier: "Rare",
				title: "Done",
			},
			{
				error: "Broken",
				id: "failed",
				score: 0,
				slug: "failed",
				status: "failed",
				tier: "Charcoal",
				title: "Failed",
			},
			{
				error: null,
				id: "failed-default",
				score: 0,
				slug: "failed-default",
				status: "failed",
				tier: "Charcoal",
				title: "Failed default",
			},
		]);
		render(component(batchModule.Route));
		expect(
			screen.getByText("All traces settled. Polling stopped."),
		).toBeTruthy();
		expect(screen.getByText("Broken")).toBeTruthy();
		expect(screen.getByText("Processing failed.")).toBeTruthy();
		cleanup();

		let intervalCallback: (() => Promise<void>) | undefined;
		const originalSetInterval = window.setInterval;
		const originalClearInterval = window.clearInterval;
		window.setInterval = mock((callback: () => Promise<void>) => {
			intervalCallback = callback;
			return 1;
		}) as typeof window.setInterval;
		window.clearInterval = mock() as typeof window.clearInterval;
		routeData.set("/app/roasts/$batch", [
			{
				error: null,
				id: "processing",
				score: 0,
				slug: "processing",
				status: "processing",
				tier: "Processing",
				title: "Processing",
			},
		]);
		queryResponses.push({ data: [] });
		queryResponses.push({
			data: [
				{
					error: null,
					id: "done",
					score: 90,
					slug: "done",
					status: "done",
					tier: "Rare",
					title: "Done",
				},
			],
		});
		render(component(batchModule.Route));
		expect(screen.getByLabelText("Processing")).toBeTruthy();
		await act(async () => {
			await intervalCallback?.();
		});
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				params: { slug: "done" },
				to: "/r/$slug",
			}),
		);
		cleanup();

		setDbError(new Error("offline"));
		render(component(batchModule.Route));
		expect(
			await screen.findByText("Batch processing could not start."),
		).toBeTruthy();
		await act(async () => {
			await intervalCallback?.();
		});
		expect(
			await screen.findByText("Could not refresh batch status."),
		).toBeTruthy();
		cleanup();
		window.setInterval = originalSetInterval;
		window.clearInterval = originalClearInterval;
	});
});

describe("ingest API route", () => {
	const post = (
		(apiModule.Route.options.server as RouteOptions).handlers as RouteOptions
	).POST as (options: { request: Request }) => Promise<Response>;

	async function json(request: Request) {
		const response = await post({ request });
		return { body: await response.json(), status: response.status };
	}

	it("requires configuration and constant-time bearer authentication", async () => {
		delete process.env.INGEST_TOKEN;
		expect(
			await json(
				new Request("https://roast0.test/api/ingest", { method: "POST" }),
			),
		).toMatchObject({ status: 503 });
		process.env.INGEST_TOKEN = "secret";
		for (const authorization of [
			undefined,
			"Basic secret",
			"Bearer x",
			"Bearer wrong!",
		]) {
			const headers = authorization ? { authorization } : undefined;
			expect(
				await json(
					new Request("https://roast0.test/api/ingest", {
						headers,
						method: "POST",
					}),
				),
			).toMatchObject({ status: 401 });
		}
	});

	it("validates JSON, trace shape, title size, and ingest failures", async () => {
		process.env.INGEST_TOKEN = "secret";
		const headers = {
			authorization: "Bearer secret",
			"content-type": "application/json",
		};
		expect(
			await json(
				new Request("https://roast0.test/api/ingest", {
					body: "not-json",
					headers,
					method: "POST",
				}),
			),
		).toMatchObject({ status: 400 });
		for (const body of [null, [], {}, { trace: [] }]) {
			expect(
				await json(
					new Request("https://roast0.test/api/ingest", {
						body: JSON.stringify(body),
						headers,
						method: "POST",
					}),
				),
			).toMatchObject({ status: 400 });
		}
		expect(
			await json(
				new Request("https://roast0.test/api/ingest", {
					body: JSON.stringify({ title: "x".repeat(121), trace: {} }),
					headers,
					method: "POST",
				}),
			),
		).toMatchObject({ status: 400 });

		setDbError(new Error("failed"));
		expect(
			await json(
				new Request("https://roast0.test/api/ingest", {
					body: JSON.stringify({ trace: {} }),
					headers,
					method: "POST",
				}),
			),
		).toMatchObject({ status: 500 });

		resetDb();
		queryResponses.push({}, { data: [] });
		expect(
			await json(
				new Request("https://roast0.test/api/ingest", {
					body: JSON.stringify({ source: "live", title: " New ", trace: {} }),
					headers,
					method: "POST",
				}),
			),
		).toMatchObject({ body: { slug: expect.any(String) }, status: 201 });
		const inserted = queries[0]?.calls.find(
			([method]) => method === "insert",
		)?.[1][0];
		expect(inserted).toEqual([
			expect.objectContaining({ source: "live", title: "New" }),
		]);
	});
});
