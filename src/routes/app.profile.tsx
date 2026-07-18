import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { SignOutButton } from "#/components/sign-out-button";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { user } = appRoute.useRouteContext();
	const initial = user.email.slice(0, 1).toUpperCase() || "R";

	return (
		<div className="app-page">
			<header className="app-page__header">
				<p>Roast0 / Profile</p>
				<h1>Profile</h1>
			</header>
			<section className="max-w-xl rounded-xl border border-stone-200 bg-white p-6">
				<div className="flex items-center gap-4">
					<span aria-hidden="true" className="avatar">
						{initial}
					</span>
					<div>
						<p className="text-xs font-medium uppercase tracking-wider text-stone-400">
							Account
						</p>
						<p className="mt-1 font-medium text-stone-950">{user.email}</p>
					</div>
				</div>
				<div className="mt-6 border-t border-stone-200 pt-6">
					<SignOutButton />
				</div>
			</section>
		</div>
	);
}
