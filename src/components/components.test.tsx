// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicRoast } from "../lib/public-roasts";

const mock = vi.fn;

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
Object.defineProperty(globalThis, "scrollTo", {
	configurable: true,
	value: mock(),
});

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { DotGlyph, DotMatrix } = await import("./DotMatrix");
const { Logo: LandingLogo } = await import("./Logo");
const { RoastCard } = await import("./RoastCard");
const { RoastProductShot } = await import("./RoastProductShot");
const { ShareButtons } = await import("./ShareButtons");
const { AuthField } = await import("./auth-form");
const { DotMatrixSpark, FlintMark, Logo } = await import("./brand");
const { RoastTable, SeverityCounts } = await import("./roast-table");

const roast: PublicRoast = {
	slug: "hot-one",
	title: "Leaky agent",
	source: "upload",
	score: 12,
	tier: "Well Done",
	roastLine: null,
	createdAt: "2026-07-18T00:00:00Z",
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
				<FlintMark />
				<Logo className="custom" />
				<DotMatrixSpark className="custom" />
				<RoastProductShot />
			</>,
		);

		expect(screen.getAllByText("flint")).toHaveLength(3);
		expect(container.querySelectorAll("svg").length).toBeGreaterThan(5);
		expect(screen.getByText("Leaky support agent")).toBeTruthy();
	});

	it("renders full and empty public trace reports", () => {
		const { rerender } = render(<RoastCard roast={roast} />);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
			"This agent cooked the budget",
		);
		expect(screen.getByText("+ 1 lower-priority findings")).toBeTruthy();
		expect(screen.getByText("tokens n/a · duration n/a")).toBeTruthy();
		expect(screen.getByText("10 tok · 500ms")).toBeTruthy();
		expect(screen.getByText("15 tok · 1.5s")).toBeTruthy();
		expect(screen.getByText("$12000")).toBeTruthy();

		rerender(
			<RoastCard
				roast={{ ...roast, findings: [], timeline: [], roastLine: "Clean." }}
			/>,
		);
		expect(screen.getByText("No material finding in this trace.")).toBeTruthy();
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
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		Object.defineProperty(navigator, "share", {
			configurable: true,
			value: undefined,
		});
		const { rerender } = render(<ShareButtons roast={roast} />);

		fireEvent.click(screen.getByRole("button", { name: "Copy roast" }));
		await screen.findByRole("button", { name: "Copied" });
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("12/100"));

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
	});
});
