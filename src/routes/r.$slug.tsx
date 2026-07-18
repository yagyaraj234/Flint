import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Flame } from "lucide-react";

import { TierChip } from "#/components/roast-table";

const loadRoast = createServerFn({ method: "GET" })
	.validator((value: unknown) => {
		const input =
			value && typeof value === "object"
				? (value as Record<string, unknown>)
				: {};
		const slug = typeof input.slug === "string" ? input.slug : "";
		if (!/^[A-Za-z0-9_-]{1,32}$/.test(slug))
			throw new Error("Invalid roast slug.");
		return { slug };
	})
	.handler(async ({ data }) => {
		const { getRoastBySlug } = await import("#/lib/roasts.server");
		return getRoastBySlug(data.slug);
	});

export const Route = createFileRoute("/r/$slug")({
	loader: async ({ params }) => {
		const roast = await loadRoast({ data: { slug: params.slug } });
		if (!roast) throw notFound();
		return roast;
	},
	component: RoastCard,
});

function RoastCard() {
	const roast = Route.useLoaderData();

	return (
		<main className="min-h-screen bg-stone-950 px-5 py-10 text-stone-100">
			<div className="mx-auto max-w-3xl">
				<nav className="mb-8 flex items-center justify-between">
					<a
						href="/"
						className="flex items-center gap-2 font-serif text-xl font-semibold"
					>
						<Flame className="text-orange-500" size={20} aria-hidden="true" />{" "}
						Roast0
					</a>
					<a
						href="/app/new"
						className="text-sm font-medium text-orange-400 hover:text-orange-300"
					>
						Roast yours →
					</a>
				</nav>

				<article className="rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-2xl sm:p-10">
					<div className="flex flex-wrap items-start justify-between gap-5">
						<div>
							<span className="rounded-full bg-stone-800 px-2.5 py-1 text-xs capitalize text-stone-300">
								{roast.source}
							</span>
							<h1 className="mt-4 text-3xl font-semibold tracking-tight">
								{roast.title}
							</h1>
						</div>
						<div className="text-right">
							<p className="font-mono text-6xl font-bold text-orange-500">
								{roast.score}
							</p>
							<div className="mt-2">
								<TierChip tier={roast.tier} />
							</div>
						</div>
					</div>

					{roast.status !== "done" ? (
						<p className="mt-8 rounded-lg bg-stone-800 p-4 text-stone-300">
							This roast is {roast.status}.
						</p>
					) : (
						<>
							{roast.roastLine && (
								<p className="mt-8 font-serif text-2xl italic text-orange-100">
									“{roast.roastLine}”
								</p>
							)}
							<section className="mt-8">
								<h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
									Top findings
								</h2>
								{roast.findings.length === 0 ? (
									<p className="mt-3 text-stone-300">
										No findings. Suspiciously competent.
									</p>
								) : (
									<ul className="mt-3 space-y-3">
										{roast.findings.slice(0, 3).map((finding) => (
											<li
												key={finding.id}
												className="rounded-lg border border-stone-800 bg-stone-950 p-4"
											>
												<div className="flex gap-2 text-xs uppercase tracking-wide text-orange-400">
													<span>{finding.category}</span>
													<span>severity {finding.severity}</span>
												</div>
												<p className="mt-2 text-stone-200">{finding.message}</p>
											</li>
										))}
									</ul>
								)}
							</section>

							<section className="mt-8 grid gap-3 border-t border-stone-800 pt-6 sm:grid-cols-3">
								<Metric
									label="Total spend"
									value={formatUsd(roast.cost.totalUsd)}
								/>
								<Metric label="Waste" value={formatUsd(roast.cost.wasteUsd)} />
								<Metric label="Token source" value={roast.cost.tokenSource} />
							</section>
						</>
					)}
				</article>
			</div>
		</main>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg bg-stone-950 p-4">
			<p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
			<p className="mt-2 font-mono text-lg font-semibold">{value}</p>
		</div>
	);
}

function formatUsd(value: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 4,
	}).format(value);
}
