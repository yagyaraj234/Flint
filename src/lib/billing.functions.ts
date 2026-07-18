import { createServerFn } from "@tanstack/react-start";

import {
	requireAccessToken,
	requireAuthenticatedUser,
} from "./supabase-auth.server";

const apiUrl = process.env.API_URL ?? "http://localhost:8000";

export type BillingStatus =
	| {
			plan: "free";
			status: string;
			scans_used_this_month: number;
			scans_included: number;
	  }
	| {
			plan: "pro";
			status: string;
			credits_remaining?: number;
			current_period_end?: string;
	  };

async function billingApi<T>(
	path: string,
	accessToken: string,
	init: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${accessToken}`,
			...init.headers,
		},
	});
	if (!response.ok) throw new Error("Billing request could not be completed.");
	return (await response.json()) as T;
}

export const createBillingCheckout = createServerFn({ method: "POST" }).handler(
	async (): Promise<string> => {
		await requireAuthenticatedUser();
		const response = await billingApi<{ checkout_url: string }>(
			"/billing/checkout",
			await requireAccessToken(),
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			},
		);
		return response.checkout_url;
	},
);

export const getBillingStatus = createServerFn({ method: "GET" }).handler(
	async (): Promise<BillingStatus> => {
		await requireAuthenticatedUser();
		const response = await billingApi<BillingStatus>(
			"/billing/status",
			await requireAccessToken(),
		);
		return response.plan === "free"
			? {
					plan: response.plan,
					status: response.status,
					scans_used_this_month: response.scans_used_this_month,
					scans_included: response.scans_included,
				}
			: {
					plan: response.plan,
					status: response.status,
					credits_remaining: response.credits_remaining,
					current_period_end: response.current_period_end,
				};
	},
);
