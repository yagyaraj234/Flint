import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { AppShell } from "#/components/app-shell";
import { getCurrentUser } from "#/lib/auth.functions";

const loadDashboard = createServerFn({ method: "GET" }).handler(async () => {
	const [{ getDashboardData }, { requireAuthenticatedUser }] =
		await Promise.all([
			import("#/lib/roasts.server"),
			import("#/lib/supabase-auth.server"),
		]);
	const user = await requireAuthenticatedUser();
	return getDashboardData(user.id);
});

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
