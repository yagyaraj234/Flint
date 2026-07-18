import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import { useAppSearch } from "#/components/app-shell";
import { RoastTable } from "#/components/roast-table";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/")({ component: Dashboard });

function Dashboard() {
	const { stats, recent } = appRoute.useLoaderData();
	const query = useAppSearch();

	return (
		<main className="app-page">
			<AppPageHeader
				action={
					<a
						href="/app/new"
						className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
					>
						New roast
					</a>
				}
				breadcrumb="Dashboard / Overview"
				description="Real traces, findings, and cost waste."
				title="Dashboard"
			/>

			<section
				className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
				aria-label="Roast stats"
			>
				<Stat label="Total roasts" value={String(stats.totalRoasts)} />
				<Stat
					label="Secrets caught"
					value={String(stats.secretsCaught)}
					ember
				/>
				<Stat label="$ waste found" value={formatUsd(stats.wasteUsd)} />
				<Stat
					label="Worst score this week"
					value={
						stats.worstScoreThisWeek === null
							? "—"
							: String(stats.worstScoreThisWeek)
					}
				/>
			</section>

			<section className="mt-8">
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-lg font-semibold">Recent roasts</h2>
					<a
						href="/app/roasts"
						className="text-sm font-medium text-orange-700 hover:text-orange-900"
					>
						View all
					</a>
				</div>
				<RoastTable roasts={recent} query={query} />
			</section>
		</main>
	);
}

function Stat({
	label,
	value,
	ember = false,
}: {
	label: string;
	value: string;
	ember?: boolean;
}) {
	return (
		<div
			className={`rounded-xl border p-5 ${ember ? "border-orange-200 bg-orange-50" : "border-stone-200 bg-white"}`}
		>
			<p className={`text-sm ${ember ? "text-orange-700" : "text-stone-500"}`}>
				{label}
			</p>
			<p
				className={`mt-2 font-mono text-3xl font-semibold ${ember ? "text-orange-700" : "text-stone-950"}`}
			>
				{value}
			</p>
		</div>
	);
}

function formatUsd(value: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	}).format(value);
}
