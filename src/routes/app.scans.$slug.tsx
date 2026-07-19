import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ReportView } from "#/components/ReportView";
import { getPublicRoast } from "#/lib/public-roasts.functions";

export const Route = createFileRoute("/app/scans/$slug")({
	loader: async ({ params }) => {
		const roast = await getPublicRoast({ data: params.slug });
		if (!roast) throw notFound();
		return roast;
	},
	component: ScanDetail,
	notFoundComponent: () => (
		<p className="text-sm text-muted">This scan is unavailable.</p>
	),
});

function ScanDetail() {
	const roast = Route.useLoaderData();
	return (
		<section>
			<Link
				className="text-sm font-medium text-accent transition-colors hover:text-blue-700"
				to="/app/scans"
			>
				← All scans
			</Link>
			<div className="mt-5">
				<ReportView roast={roast} />
			</div>
		</section>
	);
}
