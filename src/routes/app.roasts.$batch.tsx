import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	ArrowUpRight,
	CheckCircle2,
	CircleX,
	LoaderCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { SeverityCounts } from "#/components/roast-table";
import type { BatchRoast } from "#/lib/roasts";

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

const loadBatch = createServerFn({ method: "GET" })
	.validator(batchValidator)
	.handler(({ data }) => loadBatchData(data));

export async function loadBatchData(data: { batchId: string }) {
	const [
		{ getMyRoasts },
		{ mapOwnerRoastToBatchRoast },
		{ requireAccessToken, requireAuthenticatedUser },
	] = await Promise.all([
		import("#/lib/api"),
		import("#/lib/roasts"),
		import("#/lib/supabase-auth.server"),
	]);
	await requireAuthenticatedUser();
	const rows = await getMyRoasts(await requireAccessToken(), data.batchId);
	return rows.map(mapOwnerRoastToBatchRoast);
}

export const Route = createFileRoute("/app/roasts/$batch")({
	loader: ({ params }) => loadBatch({ data: { batchId: params.batch } }),
	component: BatchStatus,
});

function BatchStatus() {
	const initialRows = Route.useLoaderData();
	const { batch } = Route.useParams();
	const navigate = useNavigate();
	const [rows, setRows] = useState<BatchRoast[]>(initialRows);
	const [error, setError] = useState("");
	const settled =
		rows.length > 0 && rows.every((row) => row.status !== "processing");

	useEffect(() => {
		if (settled || rows.length === 0) return;
		let active = true;
		const timer = window.setInterval(async () => {
			try {
				const nextRows = await loadBatch({ data: { batchId: batch } });
				if (active) setRows(nextRows);
			} catch {
				if (active) setError("Could not refresh batch status.");
			}
		}, 1_500);

		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [batch, rows.length, settled]);

	useEffect(() => {
		const row = rows.length === 1 ? rows[0] : undefined;
		if (row?.status === "done") {
			void navigate({ to: "/r/$slug", params: { slug: row.slug } });
		}
	}, [navigate, rows]);

	return (
		<main className="app-page">
			<AppPageHeader
				description={
					settled
						? "All traces settled. Polling stopped."
						: "Processing traces. Status refreshes every 1.5 seconds."
				}
				title="Scan status"
			/>

			{error && (
				<p
					className="mt-4 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-700"
					role="alert"
				>
					{error}
				</p>
			)}
			{rows.length === 0 ? (
				<div className="mt-7 rounded-xl border border-stone-200 bg-white p-10 text-center text-stone-500">
					Batch not found.
				</div>
			) : (
				<ul className="mt-7 space-y-3">
					{rows.map((row) => (
						<StatusRow key={row.id} row={row} />
					))}
				</ul>
			)}
		</main>
	);
}

function StatusRow({ row }: { row: BatchRoast }) {
	return (
		<li className="flex flex-wrap items-center gap-4 rounded-xl border border-stone-200 bg-white px-5 py-4">
			{row.status === "processing" ? (
				<LoaderCircle
					className="size-5 animate-spin text-orange-600"
					aria-label="Processing"
				/>
			) : row.status === "done" ? (
				<CheckCircle2 className="size-5 text-green-600" aria-label="Done" />
			) : (
				<CircleX className="size-5 text-orange-700" aria-label="Failed" />
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">{row.title}</p>
				{row.status === "processing" && (
					<p className="text-sm text-stone-500">processing</p>
				)}
				{row.status === "failed" && (
					<p className="text-sm text-orange-700">
						{row.error || "Processing failed."}
					</p>
				)}
			</div>
			{row.status === "done" && (
				<>
					<span className="font-mono text-lg font-semibold">
						Flint score {row.score}
					</span>
					<SeverityCounts counts={row.findingCounts} />
					<a
						href={`/r/${row.slug}`}
						className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-900"
					>
						Report <ArrowUpRight size={14} aria-hidden="true" />
					</a>
				</>
			)}
		</li>
	);
}
