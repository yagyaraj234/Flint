import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import { useAppSearch } from "#/components/app-shell";
import { RoastTable } from "#/components/roast-table";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/scans/")({ component: Scans });

function Scans() {
	const { roasts } = appRoute.useLoaderData();
	const query = useAppSearch();

	return (
		<main>
			<AppPageHeader
				description="Filter real scans by source or status. Sort any column."
				title="All scans"
			/>
			<div className="mt-7">
				<RoastTable controls roasts={roasts} query={query} />
			</div>
		</main>
	);
}
