import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import { useAppSearch } from "#/components/app-shell";
import { RoastTable } from "#/components/roast-table";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/roasts/")({ component: Roasts });

function Roasts() {
	const { roasts } = appRoute.useLoaderData();
	const query = useAppSearch();

	return (
		<main className="app-page">
			<AppPageHeader
				breadcrumb="Dashboard / Roasts"
				description="Search by title from the top bar."
				title="All roasts"
			/>
			<div className="mt-7">
				<RoastTable roasts={roasts} query={query} />
			</div>
		</main>
	);
}
