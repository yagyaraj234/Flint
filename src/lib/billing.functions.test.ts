import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	requireAccessToken: vi.fn(),
	requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: ({ method = "GET" }: { method?: string } = {}) => ({
		handler(handler: () => unknown) {
			return Object.assign(handler, { method });
		},
	}),
}));

vi.mock("./supabase-auth.server", () => state);

const { createBillingCheckout, getBillingStatus } = await import(
	"./billing.functions"
);
const fetchMock = vi.fn();

beforeEach(() => {
	state.requireAuthenticatedUser.mockResolvedValue({ id: "user-1" });
	state.requireAccessToken.mockResolvedValue("access-token");
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	fetchMock.mockReset();
	state.requireAccessToken.mockReset();
	state.requireAuthenticatedUser.mockReset();
});

describe("billing server functions", () => {
	test("creates an authenticated checkout and returns only its URL", async () => {
		fetchMock.mockResolvedValue(
			Response.json({
				checkout_url: "https://checkout.test/session",
				secret: "not-forwarded",
			}),
		);

		await expect(createBillingCheckout()).resolves.toBe(
			"https://checkout.test/session",
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/billing/checkout",
			expect.objectContaining({
				body: "{}",
				headers: expect.objectContaining({
					authorization: "Bearer access-token",
				}),
				method: "POST",
			}),
		);
	});

	test("loads authenticated status without forwarding unknown fields", async () => {
		fetchMock.mockResolvedValue(
			Response.json({
				plan: "free",
				status: "none",
				scans_used_this_month: 2,
				scans_included: 5,
				secret: "not-forwarded",
			}),
		);

		await expect(getBillingStatus()).resolves.toEqual({
			plan: "free",
			status: "none",
			scans_used_this_month: 2,
			scans_included: 5,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/billing/status",
			{
				headers: { authorization: "Bearer access-token" },
			},
		);
	});
});
