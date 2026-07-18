import { createServerFn } from "@tanstack/react-start";

import {
	parseSharingPayload,
	type SharingPayload,
	validateShareInput,
	validateSharingSlug,
	validateVisibilityInput,
} from "./shares";
import {
	requireAccessToken,
	requireAuthenticatedUser,
} from "./supabase-auth.server";

const apiUrl = process.env.API_URL ?? "http://localhost:8000";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authenticatedToken(): Promise<string> {
	await requireAuthenticatedUser();
	return requireAccessToken();
}

async function sharingApi(
	path: string,
	accessToken: string,
	init: RequestInit = {},
): Promise<SharingPayload> {
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${accessToken}`,
			...init.headers,
		},
	});
	if (!response.ok) {
		let message = "Sharing request could not be completed.";
		try {
			const body: unknown = await response.json();
			if (isRecord(body) && typeof body.detail === "string") {
				message = body.detail;
			}
		} catch {
			// Keep stable fallback for non-JSON backend errors.
		}
		throw new Error(message);
	}
	return parseSharingPayload(await response.json());
}

export const getRoastSharing = createServerFn({ method: "GET" })
	.validator(validateSharingSlug)
	.handler(async ({ data: slug }) =>
		sharingApi(
			`/me/roasts/${encodeURIComponent(slug)}/sharing`,
			await authenticatedToken(),
		),
	);

export const updateRoastVisibility = createServerFn({ method: "POST" })
	.validator(validateVisibilityInput)
	.handler(async ({ data }) =>
		sharingApi(
			`/me/roasts/${encodeURIComponent(data.slug)}/visibility`,
			await authenticatedToken(),
			{
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ visibility: data.visibility }),
			},
		),
	);

export const addRoastShare = createServerFn({ method: "POST" })
	.validator(validateShareInput)
	.handler(async ({ data }) =>
		sharingApi(
			`/me/roasts/${encodeURIComponent(data.slug)}/shares`,
			await authenticatedToken(),
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: data.email }),
			},
		),
	);

export const removeRoastShare = createServerFn({ method: "POST" })
	.validator(validateShareInput)
	.handler(async ({ data }) =>
		sharingApi(
			`/me/roasts/${encodeURIComponent(data.slug)}/shares/${encodeURIComponent(data.email)}`,
			await authenticatedToken(),
			{ method: "DELETE" },
		),
	);
