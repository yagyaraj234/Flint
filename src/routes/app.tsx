import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell";
import { getCurrentUser } from "#/lib/auth.functions";

export const Route = createFileRoute("/app")({
	beforeLoad: async () => {
		const user = await getCurrentUser();
		if (!user) throw redirect({ to: "/login" });
		return { user };
	},
	component: AppLayout,
});

function AppLayout() {
	const { user } = Route.useRouteContext();
	return <AppShell user={user} />;
}
