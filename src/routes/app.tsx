import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell";
import { getCurrentUser } from "#/lib/auth.functions";
import { loadDashboard } from "#/lib/roast-functions";

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
