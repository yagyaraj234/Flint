import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Logo } from "../../components/Logo";
import { ReportView } from "../../components/ReportView";
import { publicRoastMeta } from "../../lib/public-roasts";
import { getPublicRoast } from "../../lib/public-roasts.functions";

export const Route = createFileRoute("/r/$slug")({
	loader: async ({ params }) => {
		const roast = await getPublicRoast({ data: params.slug });
		if (!roast) throw notFound();
		return roast;
	},
	head: ({ loaderData }) => {
		if (!loaderData) return { meta: [{ title: "Report not found · Flint" }] };
		const meta = publicRoastMeta(loaderData);
		return {
			meta: [
				{ title: meta.title },
				{ name: "description", content: meta.description },
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "Flint" },
				{ property: "og:title", content: meta.title },
				{ property: "og:description", content: meta.description },
				{ name: "twitter:card", content: "summary" },
				{ name: "twitter:title", content: meta.title },
				{ name: "twitter:description", content: meta.description },
			],
		};
	},
	component: PublicRoastPage,
	notFoundComponent: PublicRoastNotFound,
});

function PublicTopbar() {
	return (
		<header className="public-topbar">
			<div>
				<Logo inverse />
				<a href="/app/new">
					Scan yours <ArrowRight aria-hidden="true" />
				</a>
			</div>
		</header>
	);
}

function PublicRoastPage() {
	const roast = Route.useLoaderData();
	return (
		<div className="public-page">
			<PublicTopbar />
			<main className="public-page__main">
				<ReportView roast={roast} />
				<p className="public-page__stamp">
					Flint · security scanning for AI agent traces
				</p>
			</main>
		</div>
	);
}

function PublicRoastNotFound() {
	return (
		<div className="public-page">
			<PublicTopbar />
			<main className="public-not-found">
				<p className="mono-label">404 · REPORT NOT FOUND</p>
				<h1>This report is unavailable.</h1>
				<p>Check the public URL, or scan a fresh trace.</p>
				<a className="button" href="/app/new">
					Scan a trace <ArrowRight aria-hidden="true" />
				</a>
			</main>
		</div>
	);
}
