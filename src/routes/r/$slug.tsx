import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Logo } from "../../components/Logo";
import { ReportView } from "../../components/ReportView";
import { monoLabel, primaryButton } from "../../components/ui";
import { publicRoastMeta } from "../../lib/public-roasts";
import { getPublicRoast } from "../../lib/public-roasts.functions";

export const Route = createFileRoute("/r/$slug")({
	loader: async ({ params }) => {
		const roast = await getPublicRoast({ data: params.slug });
		if (!roast) throw notFound();
		return roast;
	},
	head: ({ loaderData }) => {
		if (!loaderData) return { meta: [{ title: "Report not found · Helix" }] };
		const meta = publicRoastMeta(loaderData);
		return {
			meta: [
				{ title: meta.title },
				{ name: "description", content: meta.description },
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "Helix" },
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
		<header className="border-b border-line bg-white/85 backdrop-blur print:hidden">
			<div className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between px-6">
				<Logo />
				<a
					className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors duration-150 hover:text-accent"
					href="/app/new"
				>
					Scan yours <ArrowRight size={15} aria-hidden="true" />
				</a>
			</div>
		</header>
	);
}

function PublicRoastPage() {
	const roast = Route.useLoaderData();
	return (
		<div className="min-h-screen bg-paper">
			<PublicTopbar />
			<main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 sm:py-12">
				<ReportView roast={roast} />
				<p className={`${monoLabel} mt-6 text-center text-muted print:hidden`}>
					Helix · AI agent cost &amp; risk scanner
				</p>
			</main>
		</div>
	);
}

function PublicRoastNotFound() {
	return (
		<div className="min-h-screen bg-paper">
			<PublicTopbar />
			<main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[780px] flex-col items-start justify-center px-6">
				<p className={`${monoLabel} text-accent`}>404 · Report not found</p>
				<h1 className="mt-4 mb-3 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-ink sm:text-7xl">
					This report is unavailable.
				</h1>
				<p className="mb-7 text-muted">
					Check the public URL, or scan a fresh trace.
				</p>
				<a className={primaryButton} href="/app/new">
					Scan a trace <ArrowRight size={15} aria-hidden="true" />
				</a>
			</main>
		</div>
	);
}
