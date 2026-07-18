import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { useAppSearch } from "#/components/app-shell";
import { RoastTable } from "#/components/roast-table";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/roasts/")({ component: Roasts });

function Roasts() {
	const { roasts } = appRoute.useLoaderData();
	const query = useAppSearch();

	return (
		<main className="app-page">
			<p className="text-xs font-medium uppercase tracking-wider text-stone-400">
				Dashboard / Roasts
			</p>
			<h1 className="mt-2 text-3xl font-semibold tracking-tight">All roasts</h1>
			<p className="mt-1 text-sm text-stone-500">
				Search by title from the top bar.
			</p>
			<div className="mt-7">
				<RoastTable roasts={roasts} query={query} />
			</div>
		</main>
	);
}
