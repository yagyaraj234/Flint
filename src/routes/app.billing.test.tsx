// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	createBillingCheckout: vi.fn(),
	getBillingStatus: vi.fn(),
}));

vi.mock("#/lib/billing.functions", () => state);
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: (_path: string) => (options: Record<string, unknown>) =>
		options,
	Link: ({
		activeOptions: _activeOptions,
		activeProps: _activeProps,
		children,
		to,
		...props
	}: {
		activeOptions?: unknown;
		activeProps?: unknown;
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	Outlet: () => null,
}));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "https://flint.test/app/billing",
});
const assign = vi.fn();
const browserWindow = new Proxy(dom.window, {
	get(target, property) {
		if (property === "location") return { assign };
		return Reflect.get(target, property);
	},
});

for (const key of [
	"document",
	"navigator",
	"HTMLElement",
	"SVGElement",
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
Object.defineProperty(globalThis, "window", {
	configurable: true,
	value: browserWindow,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	value: true,
	writable: true,
});

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { AppShell } = await import("#/components/app-shell");
const { BillingPage } = await import("./app.billing");

beforeEach(() => {
	assign.mockReset();
	state.createBillingCheckout.mockReset();
	state.getBillingStatus.mockReset();
});

afterEach(() => cleanup());

describe("billing page", () => {
	test("shows free usage and redirects upgrade checkout", async () => {
		state.getBillingStatus.mockResolvedValue({
			plan: "free",
			status: "none",
			scans_used_this_month: 2,
			scans_included: 5,
		});
		state.createBillingCheckout.mockResolvedValue(
			"https://checkout.test/session",
		);
		render(<BillingPage />);

		await waitFor(() => expect(screen.getByText("2 / 5")).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
		await waitFor(() =>
			expect(assign).toHaveBeenCalledWith("https://checkout.test/session"),
		);
	});

	test("shows pro credits and billing period", async () => {
		state.getBillingStatus.mockResolvedValue({
			plan: "pro",
			status: "active",
			credits_remaining: 42,
			current_period_end: "2026-08-18T00:00:00Z",
		});
		render(<BillingPage />);

		await waitFor(() => expect(screen.getByText("42")).toBeTruthy());
		expect(screen.getByText(/Aug 18, 2026/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).toBeNull();
	});
});

test("app nav shows billing link with current plan badge", async () => {
	state.getBillingStatus.mockResolvedValue({
		plan: "pro",
		status: "active",
		credits_remaining: 42,
	});
	render(<AppShell totalRoasts={3} user={{ email: "user@example.com" }} />);

	expect(
		screen.getByRole("link", { name: /Billing/ }).getAttribute("href"),
	).toBe("/app/billing");
	await waitFor(() => expect(screen.getByText("Pro")).toBeTruthy());
});
