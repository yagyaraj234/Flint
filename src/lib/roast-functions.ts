import { createServerFn } from "@tanstack/react-start";

import { getMyRoasts, ingestBatch } from "./api";
import { parseTraceDataset } from "./ingest";
import {
	mapOwnerRoastToBatchRoast,
	mapOwnerRoastToListItem,
	mapOwnerRoastToMetrics,
	summarizeRoasts,
} from "./roasts";
import {
	requireAccessToken,
	requireAuthenticatedUser,
} from "./supabase-auth.server";

export const loadDashboard = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuthenticatedUser();
		const rows = await getMyRoasts(await requireAccessToken());
		const roasts = rows.map(mapOwnerRoastToListItem);
		return {
			stats: summarizeRoasts(rows.map(mapOwnerRoastToMetrics), rows.length),
			recent: roasts.slice(0, 10),
			roasts,
		};
	},
);

export const createUpload = createServerFn({ method: "POST" })
	.validator((value: unknown) => {
		const input =
			value && typeof value === "object"
				? (value as Record<string, unknown>)
				: {};
		if (typeof input.text !== "string")
			throw new Error("Trace JSON is required.");
		const title = typeof input.title === "string" ? input.title.trim() : "";
		if (title.length > 120)
			throw new Error("Title must be 120 characters or less.");
		return { text: input.text, title };
	})
	.handler(async ({ data }) => {
		await requireAuthenticatedUser();
		return ingestBatch(
			{
				traces: parseTraceDataset(data.text),
				title: data.title || undefined,
			},
			await requireAccessToken(),
		);
	});

const batchValidator = (value: unknown) => {
	const input =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const batchId = typeof input.batchId === "string" ? input.batchId : "";
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			batchId,
		)
	) {
		throw new Error("Invalid batch id.");
	}
	return { batchId };
};

export const loadBatch = createServerFn({ method: "GET" })
	.validator(batchValidator)
	.handler(async ({ data }) => {
		await requireAuthenticatedUser();
		const rows = await getMyRoasts(await requireAccessToken(), data.batchId);
		return rows.map(mapOwnerRoastToBatchRoast);
	});
