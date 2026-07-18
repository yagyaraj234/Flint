import { createServerFn } from "@tanstack/react-start";

import {
	type LiveWallData,
	type PublicRoast,
	toPublicRoast,
	toPublicRoastSummaries,
} from "./public-roasts";

export const getRecentPublicRoasts = createServerFn({ method: "GET" }).handler(
	async (): Promise<LiveWallData> => {
		try {
			const { db } = await import("./db.server");
			const { data, error } = await db
				.from("roasts")
				.select("slug,title,score,tier,roast_line,created_at")
				.eq("status", "done")
				.neq("source", "langsmith")
				.order("created_at", { ascending: false })
				.limit(8);

			if (error) return { roasts: [], available: false };
			const rows: unknown = data;
			return { roasts: toPublicRoastSummaries(rows), available: true };
		} catch {
			return { roasts: [], available: false };
		}
	},
);

export const getPublicRoast = createServerFn({ method: "GET" })
	.validator((slug: string): string | null =>
		/^[a-zA-Z0-9_-]{1,64}$/.test(slug) ? slug : null,
	)
	.handler(async ({ data: slug }): Promise<PublicRoast | null> => {
		if (!slug) return null;

		try {
			const { db } = await import("./db.server");
			const { data, error } = await db
				.from("roasts")
				.select(
					"slug,title,source,score,tier,roast_line,findings,cost,normalized,created_at",
				)
				.eq("slug", slug)
				.eq("status", "done")
				.neq("source", "langsmith")
				.limit(1)
				.maybeSingle();

			if (error) return null;
			const row: unknown = data;
			return toPublicRoast(row);
		} catch {
			return null;
		}
	});
