import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { AppShell } from "#/components/app-shell";
import { getCurrentUser } from "#/lib/auth.functions";

export async function loadDashboardData() {
	const [
		{ getMyRoasts },
		{ mapOwnerRoastToListItem, mapOwnerRoastToMetrics, summarizeRoasts },
		{ requireAccessToken, requireAuthenticatedUser },
	] = await Promise.all([
		import("#/lib/api"),
		import("#/lib/roasts"),
		import("#/lib/supabase-auth.server"),
	]);
	await requireAuthenticatedUser();
	const rows = await getMyRoasts(await requireAccessToken());
	const roasts = rows.map(mapOwnerRoastToListItem);
	return {
		stats: summarizeRoasts(rows.map(mapOwnerRoastToMetrics), rows.length),
		recent: roasts.slice(0, 10),
		roasts,
	};
}

const loadDashboard = createServerFn({ method: "GET" }).handler(
	loadDashboardData,
);

export const Route = createFileRoute("/app")({
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	beforeLoad: async () => {
		const user = await getCurrentUser();
		if (!user) throw redirect({ to: "/login" });
		return { user };
	},
	loader: () => loadDashboard(),
	component: AppLayout,
});

function AppLayout() {
	const { user } = Route.useRouteContext();
	const { stats } = Route.useLoaderData();
	return <AppShell totalRoasts={stats.totalRoasts} user={user} />;
}
