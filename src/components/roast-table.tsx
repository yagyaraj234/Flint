import { ArrowUpRight, ScanSearch } from "lucide-react";

import {
	type FindingCounts,
	filterRoasts,
	type RoastListItem,
} from "#/lib/roasts";

export function RoastTable({
	roasts,
	query,
}: {
	roasts: RoastListItem[];
	query: string;
}) {
	const filtered = filterRoasts(roasts, query);

	if (roasts.length === 0) return <EmptyRoasts />;
	if (filtered.length === 0) {
		return (
			<div className="rounded-xl border border-stone-200 bg-white px-6 py-12 text-center text-sm text-stone-500">
				No scan titles match “{query.trim()}”.
			</div>
		);
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
			<table className="w-full min-w-[720px] border-collapse text-left text-sm">
				<thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
					<tr>
						<th className="px-5 py-3 font-medium">Title</th>
						<th className="px-5 py-3 font-medium">Source</th>
						<th className="px-5 py-3 font-medium">Flint score</th>
						<th className="px-5 py-3 font-medium">Findings</th>
						<th className="px-5 py-3 font-medium">Created</th>
						<th className="px-5 py-3">
							<span className="sr-only">Open</span>
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-stone-100">
					{filtered.map((roast) => (
						<tr key={roast.id} className="hover:bg-stone-50">
							<td className="px-5 py-4 font-medium text-stone-900">
								{roast.title}
							</td>
							<td className="px-5 py-4">
								<span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs capitalize text-stone-600">
									{sourceLabel(roast.source)}
								</span>
							</td>
							<td className="px-5 py-4 font-mono font-semibold">
								{roast.score}
							</td>
							<td className="px-5 py-4">
								<SeverityCounts counts={roast.findingCounts} />
							</td>
							<td className="px-5 py-4 text-stone-500">
								{formatDate(roast.createdAt)}
							</td>
							<td className="px-5 py-4 text-right">
								<a
									href={`/r/${roast.slug}`}
									className="inline-flex items-center gap-1 font-medium text-orange-700 hover:text-orange-900"
								>
									Card <ArrowUpRight size={14} aria-hidden="true" />
								</a>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const noFindings: FindingCounts = { critical: 0, warning: 0, notice: 0 };

export function SeverityCounts({
	counts = noFindings,
}: {
	counts?: FindingCounts;
}) {
	const labels = [
		counts.critical > 0 ? `${counts.critical} critical` : null,
		counts.warning > 0 ? `${counts.warning} warning` : null,
		counts.notice > 0 ? `${counts.notice} notice` : null,
	].filter((label): label is string => label !== null);

	return (
		<span className="text-xs text-stone-600">
			{labels.join(", ") || "No findings"}
		</span>
	);
}

function EmptyRoasts() {
	return (
		<div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
			<div
				role="img"
				aria-label="No scans yet"
				className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-orange-50 text-orange-500 opacity-70"
			>
				<ScanSearch size={26} />
			</div>
			<h2 className="text-lg font-semibold">No scans yet</h2>
			<p className="mt-1 text-sm text-stone-500">
				Upload a trace to get your first score.
			</p>
			<a
				href="/app/new"
				className="mt-5 inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
			>
				Scan a trace
			</a>
		</div>
	);
}

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Unknown"
		: new Intl.DateTimeFormat("en", {
				dateStyle: "medium",
			}).format(date);
}

function sourceLabel(source: RoastListItem["source"]): string {
	return source === "langsmith" ? "LangSmith" : source;
}
