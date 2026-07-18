import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import { SignOutButton } from "#/components/sign-out-button";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { user } = appRoute.useRouteContext();
	const initial = user.email.slice(0, 1).toUpperCase() || "R";

	return (
		<div className="app-page profile-page">
			<AppPageHeader title="Profile" />
			<section aria-label="Account" className="profile-page__account">
				<span aria-hidden="true" className="profile-page__avatar">
					{initial}
				</span>
				<div className="profile-page__identity">
					<p>Account</p>
					<h2>{user.email}</h2>
				</div>
				<SignOutButton />
			</section>
		</div>
	);
}
