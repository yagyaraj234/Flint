import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import { useAppSearch } from "#/components/app-shell";
import { RoastTable } from "#/components/roast-table";
import { accentLink, primaryButton } from "#/components/ui";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/")({ component: Dashboard });

function Dashboard() {
	const { stats, recent } = appRoute.useLoaderData();
	const query = useAppSearch();

	return (
		<main>
			<AppPageHeader
				action={
					<Link className={primaryButton} to="/app/new">
						New scan
					</Link>
				}
				description="Real traces, findings, and cost waste."
				title="Dashboard"
			/>

			<section
				className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
				aria-label="Scan stats"
			>
				<Stat label="Total scans" value={String(stats.totalRoasts)} />
				<Stat
					highlight
					label="Secrets caught"
					value={String(stats.secretsCaught)}
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
					<h2 className="text-lg font-semibold text-ink">Recent scans</h2>
					<Link className={`text-sm font-medium ${accentLink}`} to="/app/scans">
						View all
					</Link>
				</div>
				<RoastTable roasts={recent} query={query} />
			</section>
		</main>
	);
}

function Stat({
	highlight = false,
	label,
	value,
}: {
	highlight?: boolean;
	label: string;
	value: string;
}) {
	return (
		<div
			className={`rounded-xl border p-5 ${highlight ? "border-accent/30 bg-accent-soft" : "border-line bg-white"}`}
		>
			<p className={`text-sm ${highlight ? "text-accent" : "text-muted"}`}>
				{label}
			</p>
			<p
				className={`mt-2 font-mono text-3xl font-semibold tracking-tight ${highlight ? "text-accent" : "text-ink"}`}
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
