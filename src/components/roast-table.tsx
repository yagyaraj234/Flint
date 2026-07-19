import { Link } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowDownUp,
	ArrowUp,
	ArrowUpRight,
	ScanSearch,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
	type FindingCounts,
	filterAndSortRoasts,
	filterRoasts,
	type RoastFilters,
	type RoastListItem,
	type RoastSort,
	type SortDirection,
} from "#/lib/roasts";
import { primaryButton } from "./ui";

export function RoastTable({
	controls = false,
	roasts,
	query,
}: {
	controls?: boolean;
	roasts: RoastListItem[];
	query: string;
}) {
	const [filters, setFilters] = useState<RoastFilters>({
		source: "all",
		status: "all",
	});
	const [sort, setSort] = useState<RoastSort>("createdAt");
	const [direction, setDirection] = useState<SortDirection>("desc");
	const filtered = useMemo(
		() =>
			controls
				? filterAndSortRoasts(roasts, query, filters, sort, direction)
				: filterRoasts(roasts, query),
		[controls, direction, filters, query, roasts, sort],
	);
	const sourceOptions = useMemo(
		() => [...new Set(roasts.map((roast) => roast.source))].sort(),
		[roasts],
	);

	function changeSort(nextSort: RoastSort) {
		if (sort === nextSort) {
			setDirection((current) => (current === "asc" ? "desc" : "asc"));
			return;
		}
		setSort(nextSort);
		setDirection(
			nextSort === "title" || nextSort === "source" ? "asc" : "desc",
		);
	}

	if (roasts.length === 0) return <EmptyRoasts />;
	if (filtered.length === 0) {
		return (
			<>
				{controls ? (
					<Filters
						filters={filters}
						onChange={setFilters}
						sources={sourceOptions}
					/>
				) : null}
				<div className="rounded-xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">
					{controls
						? "No scans match these filters."
						: `No scan titles match “${query.trim()}”.`}
				</div>
			</>
		);
	}

	return (
		<>
			{controls ? (
				<Filters
					filters={filters}
					onChange={setFilters}
					sources={sourceOptions}
				/>
			) : null}
			<div className="overflow-x-auto rounded-xl border border-line bg-white">
				<table className="w-full min-w-[820px] border-collapse text-left text-sm">
					<thead className="border-b border-line bg-surface-alt text-xs uppercase tracking-wide text-muted">
						<tr>
							<SortHeader
								active={sort}
								direction={direction}
								enabled={controls}
								label="Title"
								onSort={changeSort}
								sort="title"
							/>
							<SortHeader
								active={sort}
								direction={direction}
								enabled={controls}
								label="Source"
								onSort={changeSort}
								sort="source"
							/>
							<SortHeader
								active={sort}
								direction={direction}
								enabled={controls}
								label="Helix score"
								onSort={changeSort}
								sort="score"
							/>
							<SortHeader
								active={sort}
								direction={direction}
								enabled={controls}
								label="Findings"
								onSort={changeSort}
								sort="findings"
							/>
							{controls ? (
								<SortHeader
									active={sort}
									direction={direction}
									enabled
									label="Status"
									onSort={changeSort}
									sort="status"
								/>
							) : null}
							<SortHeader
								active={sort}
								direction={direction}
								enabled={controls}
								label="Created"
								onSort={changeSort}
								sort="createdAt"
							/>
							<th className="px-5 py-3">
								<span className="sr-only">Open</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{filtered.map((roast) => (
							<tr
								key={roast.id}
								className="transition-colors hover:bg-surface-alt/60"
							>
								<td className="px-5 py-4 font-medium text-ink">
									{roast.title}
								</td>
								<td className="px-5 py-4">
									<span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs capitalize text-neutral-600">
										{sourceLabel(roast.source)}
									</span>
								</td>
								<td className="px-5 py-4 font-mono font-semibold text-ink">
									{roast.score}
								</td>
								<td className="px-5 py-4">
									<SeverityCounts counts={roast.findingCounts} />
								</td>
								{controls ? (
									<td className="px-5 py-4">
										<StatusPill status={roast.status} />
									</td>
								) : null}
								<td className="px-5 py-4 text-muted">
									{formatDate(roast.createdAt)}
								</td>
								<td className="px-5 py-4 text-right">
									<Link
										className="inline-flex items-center gap-1 font-medium text-accent transition-colors duration-150 hover:text-blue-700"
										params={{ slug: roast.slug }}
										to="/app/scans/$slug"
									>
										Card <ArrowUpRight size={14} aria-hidden="true" />
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}

function Filters({
	filters,
	onChange,
	sources,
}: {
	filters: RoastFilters;
	onChange: (filters: RoastFilters) => void;
	sources: RoastListItem["source"][];
}) {
	return (
		<fieldset className="mb-4 flex flex-wrap items-end gap-3">
			<legend className="sr-only">Scan filters</legend>
			<label className="grid gap-1.5 text-xs font-medium text-muted">
				Source
				<select
					className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
					onChange={(event) =>
						onChange({
							...filters,
							source: event.target.value as RoastFilters["source"],
						})
					}
					value={filters.source}
				>
					<option value="all">All sources</option>
					{sources.map((source) => (
						<option key={source} value={source}>
							{sourceLabel(source)}
						</option>
					))}
				</select>
			</label>
			<label className="grid gap-1.5 text-xs font-medium text-muted">
				Status
				<select
					className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
					onChange={(event) =>
						onChange({
							...filters,
							status: event.target.value as RoastFilters["status"],
						})
					}
					value={filters.status}
				>
					<option value="all">All statuses</option>
					<option value="done">Completed</option>
					<option value="processing">Processing</option>
					<option value="failed">Failed</option>
				</select>
			</label>
		</fieldset>
	);
}

function SortHeader({
	active,
	direction,
	enabled,
	label,
	onSort,
	sort,
}: {
	active: RoastSort;
	direction: SortDirection;
	enabled: boolean;
	label: string;
	onSort: (sort: RoastSort) => void;
	sort: RoastSort;
}) {
	if (!enabled) return <th className="px-5 py-3 font-medium">{label}</th>;
	const selected = active === sort;
	const Icon = selected
		? direction === "asc"
			? ArrowUp
			: ArrowDown
		: ArrowDownUp;
	return (
		<th
			aria-sort={
				selected ? (direction === "asc" ? "ascending" : "descending") : "none"
			}
			className="px-5 py-3 font-medium"
		>
			<button
				className="inline-flex items-center gap-1 text-left transition-colors hover:text-ink"
				onClick={() => onSort(sort)}
				type="button"
			>
				{label} <Icon aria-hidden="true" size={13} />
			</button>
		</th>
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
		<span className="text-xs text-neutral-600">
			{labels.join(", ") || "No findings"}
		</span>
	);
}

function StatusPill({ status }: { status: RoastListItem["status"] }) {
	const label = status === "done" ? "Completed" : status;
	const color =
		status === "done"
			? "bg-green-50 text-tier-rare"
			: status === "failed"
				? "bg-red-50 text-danger"
				: "bg-accent-soft text-accent";
	return (
		<span className={`rounded-full px-2.5 py-1 text-xs capitalize ${color}`}>
			{label}
		</span>
	);
}

function EmptyRoasts() {
	return (
		<div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
			<div
				role="img"
				aria-label="No scans yet"
				className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent"
			>
				<ScanSearch size={26} />
			</div>
			<h2 className="text-lg font-semibold text-ink">No scans yet</h2>
			<p className="mt-1 text-sm text-muted">
				Upload a trace to get your first score.
			</p>
			<Link className={`${primaryButton} mt-5`} to="/app/new">
				Scan a trace
			</Link>
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
