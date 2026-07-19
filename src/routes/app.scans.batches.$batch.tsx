import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowUpRight,
	CheckCircle2,
	CircleX,
	LoaderCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { SeverityCounts } from "#/components/roast-table";
import { loadBatch } from "#/lib/roast-functions";
import type { BatchRoast } from "#/lib/roasts";

export const Route = createFileRoute("/app/scans/batches/$batch")({
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
			void navigate({ to: "/app/scans/$slug", params: { slug: row.slug } });
		}
	}, [navigate, rows]);

	return (
		<main>
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
					className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger"
					role="alert"
				>
					{error}
				</p>
			)}
			{rows.length === 0 ? (
				<div className="mt-7 rounded-xl border border-line bg-white p-10 text-center text-muted">
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
		<li className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white px-5 py-4">
			{row.status === "processing" ? (
				<LoaderCircle
					className="size-5 animate-spin text-accent"
					aria-label="Processing"
				/>
			) : row.status === "done" ? (
				<CheckCircle2 className="size-5 text-tier-rare" aria-label="Done" />
			) : (
				<CircleX className="size-5 text-danger" aria-label="Failed" />
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-ink">{row.title}</p>
				{row.status === "processing" && (
					<p className="text-sm text-muted">processing</p>
				)}
				{row.status === "failed" && (
					<p className="text-sm text-danger">
						{row.error || "Processing failed."}
					</p>
				)}
			</div>
			{row.status === "done" && (
				<>
					<span className="font-mono text-lg font-semibold text-ink">
						Helix score {row.score}
					</span>
					<SeverityCounts counts={row.findingCounts} />
					<Link
						className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors duration-150 hover:text-blue-700"
						params={{ slug: row.slug }}
						to="/app/scans/$slug"
					>
						Report <ArrowUpRight size={14} aria-hidden="true" />
					</Link>
				</>
			)}
		</li>
	);
}
