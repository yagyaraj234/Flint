import { createServerFn } from "@tanstack/react-start";

import {
	type LiveWallData,
	type PublicRoast,
	toPublicRoast,
	toPublicRoastSummaries,
} from "./public-roasts";
import { getAccessToken } from "./supabase-auth.server";

export const getRecentPublicRoasts = createServerFn({ method: "GET" }).handler(
	getRecentPublicRoastsData,
);

export async function getRecentPublicRoastsData(): Promise<LiveWallData> {
	try {
		const { getRecentRoasts } = await import("#/lib/api");
		return {
			roasts: toPublicRoastSummaries(await getRecentRoasts()),
			available: true,
		};
	} catch {
		return { roasts: [], available: false };
	}
}

export const getPublicRoast = createServerFn({ method: "GET" })
	.validator((slug: string): string | null =>
		/^[a-zA-Z0-9_-]{1,64}$/.test(slug) ? slug : null,
	)
	.handler(async ({ data: slug }) =>
		getPublicRoastData(
			slug,
			slug ? await getAccessToken().catch(() => null) : null,
		),
	);

export async function getPublicRoastData(
	slug: string | null,
	accessToken: string | null = null,
): Promise<PublicRoast | null> {
	if (!slug) return null;

	try {
		const { getRoast } = await import("#/lib/api");
		try {
			return toPublicRoast(await getRoast(slug, accessToken ?? undefined));
		} catch {
			if (!accessToken) return null;
			return toPublicRoast(await getRoast(slug));
		}
	} catch {
		return null;
	}
}
