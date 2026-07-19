// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM, VirtualConsole } from "jsdom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicRoast } from "../lib/public-roasts";

const mock = vi.fn;

if (typeof document === "undefined") {
	const virtualConsole = new VirtualConsole().forwardTo(console, {
		jsdomErrors: ["css-parsing", "resource-loading", "unhandled-exception"],
	});
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://helix.test/r/hot-one",
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
Object.defineProperty(globalThis, "scrollTo", {
	configurable: true,
	value: mock(),
});

const {
	cleanup,
	fireEvent,
	render: renderReact,
	screen,
	waitFor,
} = await import("@testing-library/react");
const { createRootRoute, createRouter, RouterContextProvider } = await import(
	"@tanstack/react-router"
);
const { DotGlyph, DotMatrix } = await import("./DotMatrix");
const { Logo: LandingLogo } = await import("./Logo");
const { ReportView } = await import("./ReportView");
const { fixForFinding, RoastCard } = await import("./RoastCard");
const { RoastProductShot } = await import("./RoastProductShot");
const { ShareButtons } = await import("./ShareButtons");
const { AuthField } = await import("./auth-form");
const { DotMatrixSpark, HelixMark, Logo } = await import("./brand");
const { RoastTable, SeverityCounts } = await import("./roast-table");

const componentTestRouter = createRouter({ routeTree: createRootRoute() });

function render(ui: ReactNode) {
	const view = renderReact(
		<RouterContextProvider router={componentTestRouter}>
			{ui}
		</RouterContextProvider>,
	);
	return {
		...view,
		rerender(nextUi: ReactNode) {
			view.rerender(
				<RouterContextProvider router={componentTestRouter}>
					{nextUi}
				</RouterContextProvider>,
			);
		},
	};
}

it("maps every deterministic finding to a concrete fix", () => {
	for (const rule of [
		"pii-in-prompt",
		"insecure-url",
		"duplicate-llm-call",
		"repeated-bloat",
		"context-stuffing",
		"tool-loop",
		"error-tail",
		"unknown-rule",
	]) {
		const fix = fixForFinding({
			category: rule === "unknown-rule" ? "security" : "cost",
			estWasteUsd: 2,
			message: "problem",
			rule,
			severity: 2,
			spanIds: [],
		});
		expect(fix.title).not.toBe("");
	}
});

const roast: PublicRoast = {
	slug: "hot-one",
	title: "Leaky agent",
	source: "upload",
	score: 12,
	tier: "Well Done",
	roastLine: null,
	createdAt: "2026-07-18T00:00:00Z",
	traceId: "trace-123",
	visibility: "public",
	isOwner: false,
	findings: [
		{
			rule: "leaked-secret",
			category: "security",
			severity: 3,
			message: "Secret reached tool arguments.",
			estWasteUsd: null,
		},
		{
			rule: "duplicate-call",
			category: "cost",
			severity: 2,
			message: "Repeated work.",
			estWasteUsd: 2.5,
		},
		{
			rule: "error-tail",
			category: "reliability",
			severity: 2,
			message: "Ended in failure.",
			estWasteUsd: null,
		},
		{
			rule: "context-stuffing",
			category: "cost",
			severity: 1,
			message: "Large context.",
			estWasteUsd: 12,
		},
	],
	cost: {
		totalTokensIn: 1200,
		totalTokensOut: 34,
		totalUsd: 3.84,
		wasteUsd: 2.5,
		tokenSource: "measured",
		monthlyProjectionUsd: 12000,
		projectionAssumption: "at 1,000 runs/day",
		unpricedModels: [],
	},
	detailedReport: {
		summary: "A secret reached a tool and the trace repeated paid work.",
		actions: [
			{
				rule: "leaked-secret",
				issue: "Secret reached tool arguments.",
				impact: "Security: exposed credentials can be abused.",
				fix: "Rotate the credential and pass a reference instead.",
				verification: "Rerun the trace and confirm no secret finding.",
			},
		],
		generated: true,
		model: "gpt-5.6-luna",
	},
	timeline: [
		{
			id: "one",
			type: "tool",
			name: "fetch",
			model: null,
			tokensIn: null,
			tokensOut: null,
			durationMs: null,
		},
		{
			id: "two",
			type: "llm",
			name: "answer",
			model: "gpt-test",
			tokensIn: 10,
			tokensOut: null,
			durationMs: 500,
		},
		{
			id: "three",
			type: "llm",
			name: "finish",
			model: null,
			tokensIn: 10,
			tokensOut: 5,
			durationMs: 1500,
		},
	],
};

afterEach(() => cleanup());

describe("presentational components", () => {
	it("renders brand artwork and the product preview", () => {
		const { container } = render(
			<>
				<DotMatrix />
				<DotGlyph />
				<LandingLogo />
				<LandingLogo inverse />
				<HelixMark />
				<Logo className="custom" />
				<DotMatrixSpark className="custom" />
				<RoastProductShot />
			</>,
		);

		expect(screen.getAllByText("helix")).toHaveLength(3);
		expect(container.querySelectorAll("svg").length).toBeGreaterThan(5);
		expect(screen.getByText("Wasteful support agent")).toBeTruthy();
	});

	it("renders full and empty public trace reports", () => {
		const { rerender } = render(<RoastCard roast={roast} />);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
			"This agent cooked the budget",
		);
		expect(screen.getByText("+ 1 lower-priority categories")).toBeTruthy();
		expect(screen.getByText("tokens n/a · duration n/a")).toBeTruthy();
		expect(screen.getByText("10 tok · 500ms")).toBeTruthy();
		expect(screen.getByText("15 tok · 1.5s")).toBeTruthy();
		expect(screen.getByText("$12000")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Fix plan" })).toBeTruthy();
		expect(screen.getByText("Detailed assessment")).toBeTruthy();
		expect(
			screen.getByText("Rotate the credential and pass a reference instead."),
		).toBeTruthy();

		rerender(
			<RoastCard
				roast={{ ...roast, findings: [...roast.findings, roast.findings[1]] }}
			/>,
		);
		expect(screen.getByText("seen 2×")).toBeTruthy();

		rerender(
			<RoastCard
				roast={{
					...roast,
					findings: [],
					timeline: [],
					roastLine: "Clean.",
					detailedReport: { ...roast.detailedReport, actions: [] },
				}}
			/>,
		);
		expect(screen.getByText("No material finding in this trace.")).toBeTruthy();
		expect(screen.getByText("No normalized spans available.")).toBeTruthy();
		expect(
			screen.getByText("No repair work identified in this trace."),
		).toBeTruthy();
	});

	it("derives fallback fix plans when no generated actions exist", () => {
		render(
			<RoastCard
				roast={{
					...roast,
					detailedReport: { ...roast.detailedReport, actions: [] },
				}}
			/>,
		);
		expect(screen.getByText("Rotate exposed credentials")).toBeTruthy();
	});

	it("renders the professional report hierarchy and cost caveats", () => {
		const { rerender } = render(
			<ReportView
				roast={{
					...roast,
					cost: { ...roast.cost, unpricedModels: ["custom-model"] },
				}}
			/>,
		);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
			"Leaky agent",
		);
		expect(
			screen.getByText(
				"A secret reached a tool and the trace repeated paid work.",
			),
		).toBeTruthy();
		expect(screen.getByText("High")).toBeTruthy();
		expect(
			screen.getByText("Rotate the credential and pass a reference instead."),
		).toBeTruthy();
		expect(screen.getByText("$12,000.00")).toBeTruthy();
		expect(screen.getByRole("note").textContent).toContain("custom-model");
		expect(screen.getByText(/measured usage/)).toBeTruthy();
		expect(screen.getByText("Copy roast")).toBeTruthy();
		expect(screen.getByText("Trace timeline")).toBeTruthy();
		expect(screen.getByText("15 tok · 1.5s")).toBeTruthy();
		expect(screen.getByText(/cooked the budget/)).toBeTruthy();

		rerender(
			<ReportView
				roast={{ ...roast, findings: [...roast.findings, roast.findings[1]] }}
			/>,
		);
		expect(screen.getByText("Seen 2×")).toBeTruthy();

		rerender(
			<ReportView
				roast={{
					...roast,
					detailedReport: { ...roast.detailedReport, actions: [] },
				}}
			/>,
		);
		expect(screen.getByText("Rotate exposed credentials")).toBeTruthy();
		expect(screen.getByText(/Revoke this key/)).toBeTruthy();
		expect(screen.queryByText("No remediation actions required.")).toBeNull();

		rerender(
			<ReportView
				roast={{
					...roast,
					findings: [],
					detailedReport: { ...roast.detailedReport, actions: [] },
				}}
			/>,
		);
		expect(screen.getByText("No remediation actions required.")).toBeTruthy();

		rerender(<ReportView roast={{ ...roast, timeline: [] }} />);
		expect(screen.getByText("No normalized spans available.")).toBeTruthy();
	});

	it("renders table results, empty states, dates, and all tier colors", () => {
		const row = {
			id: "one",
			slug: "one",
			title: "First roast",
			source: "upload" as const,
			score: 91,
			tier: "Rare",
			status: "done" as const,
			findingCounts: { critical: 1, warning: 1, notice: 0 },
			createdAt: "2026-07-18T00:00:00Z",
		};
		const { rerender } = render(<RoastTable query="first" roasts={[row]} />);
		expect(screen.getByText("First roast")).toBeTruthy();
		expect(screen.getByText(/Jul 18, 2026/)).toBeTruthy();

		rerender(<RoastTable query="missing" roasts={[row]} />);
		expect(screen.getByText(/No scan titles match/)).toBeTruthy();
		rerender(<RoastTable query="" roasts={[]} />);
		expect(screen.getByText("No scans yet")).toBeTruthy();

		rerender(
			<>
				<SeverityCounts counts={{ critical: 3, warning: 1, notice: 0 }} />
				<RoastTable query="" roasts={[{ ...row, createdAt: "invalid" }]} />
			</>,
		);
		expect(screen.getByText("3 critical, 1 warning")).toBeTruthy();
		expect(screen.getByText("Unknown")).toBeTruthy();
	});

	it("filters scan rows and toggles date sorting", () => {
		const rows = [
			{
				id: "old",
				slug: "old-upload",
				title: "Old upload",
				source: "upload" as const,
				score: 20,
				tier: "Charcoal",
				status: "done" as const,
				createdAt: "2026-07-01T00:00:00Z",
			},
			{
				id: "new",
				slug: "new-live",
				title: "New live",
				source: "live" as const,
				score: 80,
				tier: "Rare",
				status: "processing" as const,
				createdAt: "2026-07-18T00:00:00Z",
			},
		];
		render(<RoastTable controls query="" roasts={rows} />);

		const created = screen.getByRole("columnheader", { name: /created/i });
		expect(created.getAttribute("aria-sort")).toBe("descending");
		fireEvent.click(screen.getByRole("button", { name: /created/i }));
		expect(created.getAttribute("aria-sort")).toBe("ascending");

		fireEvent.change(screen.getByLabelText("Source"), {
			target: { value: "live" },
		});
		expect(screen.getByText("New live")).toBeTruthy();
		expect(screen.queryByText("Old upload")).toBeNull();
	});
});

describe("interactive components", () => {
	it("reports auth field errors and emits edited values", () => {
		const onChange = mock();
		const { rerender } = render(
			<AuthField
				autoComplete="email"
				error="Invalid email"
				id="email"
				label="Email"
				onChange={onChange}
				type="email"
				value="bad"
			/>,
		);
		const input = screen.getByLabelText("Email");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		fireEvent.change(input, { target: { value: "user@example.com" } });
		expect(onChange).toHaveBeenCalledWith("user@example.com");

		rerender(
			<AuthField
				autoComplete="email"
				id="email"
				label="Email"
				onChange={onChange}
				type="email"
				value="user@example.com"
			/>,
		);
		expect(screen.queryByText("Invalid email")).toBeNull();
	});

	it("copies, shares, and reports browser failures", async () => {
		const writeText = mock(() => Promise.resolve());
		const write = mock(() => Promise.resolve());
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { write, writeText },
		});
		Object.defineProperty(navigator, "share", {
			configurable: true,
			value: undefined,
		});
		const { rerender } = render(<ShareButtons roast={roast} />);

		fireEvent.click(screen.getByRole("button", { name: "Copy roast" }));
		await screen.findByRole("button", { name: "Copied" });
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("12/100"));
		expect(screen.getByRole("button", { name: "Copy image" })).toBeTruthy();
		const context = {
			beginPath: mock(),
			fillRect: mock(),
			fillText: mock(),
			lineTo: mock(),
			measureText: mock(() => ({ width: 1000 })),
			moveTo: mock(),
			stroke: mock(),
		};
		const createElement = document.createElement.bind(document);
		const canvas = {
			height: 0,
			width: 0,
			getContext: mock(() => context),
			toBlob: (callback: (value: Blob | null) => void) =>
				callback(new Blob(["image"])),
		};
		vi.spyOn(document, "createElement").mockImplementation(((
			tagName: string,
		) =>
			tagName === "canvas"
				? canvas
				: createElement(tagName)) as typeof document.createElement);
		Object.defineProperty(globalThis, "ClipboardItem", {
			configurable: true,
			value: class {},
		});
		fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
		await screen.findByRole("button", { name: "Image copied" });
		expect(write).toHaveBeenCalled();
		vi.restoreAllMocks();

		fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));

		const share = mock(() => Promise.resolve());
		Object.defineProperty(navigator, "share", {
			configurable: true,
			value: share,
		});
		rerender(<ShareButtons roast={{ ...roast, roastLine: "Verdict" }} />);
		fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() => expect(share).toHaveBeenCalled());

		share.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
		fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
		expect(screen.queryByText(/Could not copy/)).toBeNull();

		share.mockRejectedValueOnce(new Error("share failed"));
		fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await screen.findByText("Could not copy. Copy the URL instead.");

		writeText.mockRejectedValueOnce(new Error("copy failed"));
		rerender(<ShareButtons roast={roast} />);
		fireEvent.click(screen.getByRole("button", { name: "Copy roast" }));
		await screen.findByText("Could not copy. Copy the URL instead.");

		Object.defineProperty(globalThis, "ClipboardItem", {
			configurable: true,
			value: undefined,
		});
		fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
		await screen.findByText("Could not copy. Copy the URL instead.");
	});
});
