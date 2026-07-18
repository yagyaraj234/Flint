import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	ArrowUpRight,
	CheckCircle2,
	CircleX,
	LoaderCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { TierChip } from "#/components/roast-table";
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
	.handler(async ({ data }) => {
		const [{ getBatchRoasts }, { requireAuthenticatedUser }] = await Promise.all([
			import("#/lib/roasts.server"),
			import("#/lib/supabase-auth.server"),
		]);
		const user = await requireAuthenticatedUser();
		return getBatchRoasts(data.batchId, user.id);
	});

const startBatch = createServerFn({ method: "POST" })
	.validator(batchValidator)
	.handler(async ({ data }) => {
		const [{ processPendingBatch }, { requireAuthenticatedUser }] =
			await Promise.all([
				import("#/lib/pipeline.server"),
				import("#/lib/supabase-auth.server"),
			]);
		const user = await requireAuthenticatedUser();
		await processPendingBatch(data.batchId, user.id);
	});

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
		// ponytail: status request runs work in-process; use a queue when jobs must outlive server requests.
		void startBatch({ data: { batchId: batch } }).catch(() => {
			if (active) setError("Batch processing could not start.");
		});
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
		<main className="mx-auto max-w-4xl p-5 lg:p-8">
			<p className="text-xs font-medium uppercase tracking-wider text-stone-400">
				Dashboard / Batch
			</p>
			<h1 className="mt-2 text-3xl font-semibold tracking-tight">
				Roast status
			</h1>
			<p className="mt-1 text-sm text-stone-500">
				{settled
					? "All traces settled. Polling stopped."
					: "Processing traces. Status refreshes every 1.5 seconds."}
			</p>

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
					<span className="font-mono text-lg font-semibold">{row.score}</span>
					<TierChip tier={row.tier} />
					<a
						href={`/r/${row.slug}`}
						className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-900"
					>
						Card <ArrowUpRight size={14} aria-hidden="true" />
					</a>
				</>
			)}
		</li>
	);
}
