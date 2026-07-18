// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = {
	addRoastShare: vi.fn(),
	getRoastSharing: vi.fn(),
	removeRoastShare: vi.fn(),
	updateRoastVisibility: vi.fn(),
};

vi.mock("../lib/shares.functions", () => state);

if (typeof document === "undefined") {
	const virtualConsole = new VirtualConsole().forwardTo(console, {
		jsdomErrors: ["css-parsing", "resource-loading", "unhandled-exception"],
	});
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://roast0.test/r/report-1",
		virtualConsole,
	});
	for (const key of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"HTMLDialogElement",
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
if (typeof HTMLDialogElement === "undefined") {
	Object.defineProperty(globalThis, "HTMLDialogElement", {
		configurable: true,
		value: window.HTMLDialogElement,
	});
}

const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { ShareDialog } = await import("./ShareDialog");
const initial = {
	visibility: "public" as const,
	shares: [{ email: "one@example.com", created_at: "2026-07-19T00:00:00Z" }],
};

beforeEach(() => {
	Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
		configurable: true,
		value() {
			this.setAttribute("open", "");
		},
	});
	Object.defineProperty(HTMLDialogElement.prototype, "close", {
		configurable: true,
		value() {
			this.removeAttribute("open");
		},
	});
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: vi.fn(() => Promise.resolve()) },
	});
	state.getRoastSharing.mockResolvedValue(initial);
	state.updateRoastVisibility.mockResolvedValue({
		...initial,
		visibility: "private",
	});
	state.addRoastShare.mockResolvedValue({
		...initial,
		shares: [
			...initial.shares,
			{ email: "two@example.com", created_at: "2026-07-19T01:00:00Z" },
		],
	});
	state.removeRoastShare.mockResolvedValue({ ...initial, shares: [] });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ShareDialog", () => {
	test("is owner-only and reflects add, remove, visibility, and copy responses", async () => {
		const view = render(<ShareDialog slug="report-1" isOwner={false} />);
		expect(view.queryByRole("button", { name: "Share report" })).toBeNull();

		view.rerender(<ShareDialog slug="report-1" isOwner />);
		fireEvent.click(view.getByRole("button", { name: "Share report" }));
		await view.findByText("one@example.com");

		fireEvent.click(view.getByRole("button", { name: "Copy" }));
		await view.findByRole("button", { name: "Copied" });
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
			window.location.href,
		);

		fireEvent.change(view.getByLabelText("Email address"), {
			target: { value: "two@example.com" },
		});
		fireEvent.click(view.getByRole("button", { name: "Add" }));
		await view.findByText("two@example.com");
		expect(state.addRoastShare).toHaveBeenCalledWith({
			data: { slug: "report-1", email: "two@example.com" },
		});

		fireEvent.click(
			view.getByRole("button", { name: "Remove one@example.com" }),
		);
		await waitFor(() => expect(view.queryByText("one@example.com")).toBeNull());

		state.updateRoastVisibility.mockResolvedValueOnce({
			...initial,
			visibility: "private",
			shares: [],
		});
		fireEvent.click(view.getByRole("button", { name: "Private" }));
		await view.findByText(
			"Recipients must sign in with an email listed below.",
		);
		expect(view.getByLabelText("Report URL")).toBeTruthy();
	});

	test("shows validation errors inline", async () => {
		state.addRoastShare.mockRejectedValueOnce(
			new Error("Enter a valid email address."),
		);
		const view = render(<ShareDialog slug="report-1" isOwner />);
		fireEvent.click(view.getByRole("button", { name: "Share report" }));
		await view.findByText("one@example.com");
		fireEvent.change(view.getByLabelText("Email address"), {
			target: { value: "bad@example.com" },
		});
		fireEvent.click(view.getByRole("button", { name: "Add" }));
		expect((await view.findByRole("alert")).textContent).toContain(
			"Enter a valid email address.",
		);
	});
});
