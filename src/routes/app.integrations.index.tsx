import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { LangSmithConnectionCard } from "#/components/langsmith-connection-card";
import type { LangSmithConnection } from "#/lib/langsmith";
import { getLangSmithConnections } from "#/lib/langsmith.functions";

export const Route = createFileRoute("/app/integrations/")({
	component: IntegrationsPage,
});

function IntegrationsPage() {
	const [connections, setConnections] = useState<LangSmithConnection[]>([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		void getLangSmithConnections()
			.then(setConnections)
			.catch(() => setError("Could not load integrations."))
			.finally(() => setLoading(false));
	}, []);

	return (
		<main className="app-page">
			<AppPageHeader
				title="Integrations"
				description="Connect LangSmith projects for redacted hourly scans."
				action={
					<Link
						to="/app/integrations/langsmith/new"
						className="inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
					>
						Connect LangSmith
					</Link>
				}
			/>
			{error ? (
				<p className="mt-6 text-sm text-orange-700" role="alert">
					{error}
				</p>
			) : null}
			{loading ? (
				<p className="mt-7 text-sm text-stone-500">Loading integrations…</p>
			) : null}
			{!loading && !connections.length ? <Empty /> : null}
			<div className="mt-7 grid gap-4">
				{connections.map((connection) => (
					<LangSmithConnectionCard
						key={connection.id}
						connection={connection}
						onChanged={(next) =>
							setConnections((current) =>
								current.map((item) => (item.id === next.id ? next : item)),
							)
						}
						onDeleted={(id) =>
							setConnections((current) =>
								current.filter((item) => item.id !== id),
							)
						}
					/>
				))}
			</div>
		</main>
	);
}

function Empty() {
	return (
		<section className="mt-7 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
			<h2 className="text-lg font-semibold">
				Scan LangSmith traces automatically
			</h2>
			<p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
				Connect a project with a workspace-scoped service key. Flint scans
				completed traces hourly and redacts before storage.
			</p>
			<Link
				to="/app/integrations/langsmith/new"
				className="mt-5 inline-flex rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
			>
				Connect LangSmith
			</Link>
		</section>
	);
}
