import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight, Copy, DollarSign, Gauge, ShieldCheck } from "lucide-react";

import { DotGlyph, DotMatrix } from "../components/DotMatrix";
import { Logo } from "../components/Logo";
import { RoastProductShot } from "../components/RoastProductShot";
import { getCurrentUser } from "../lib/auth.functions";
import { getRecentPublicRoasts } from "../lib/public-roasts.functions";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		if (await getCurrentUser()) throw redirect({ to: "/app" });
	},
	loader: () => getRecentPublicRoasts(),
	head: () => ({
		meta: [
			{ title: "Roast0 — Every trace tells on your agent" },
			{
				name: "description",
				content:
					"Upload an agent trace. Get a score, cost autopsy, security findings, and a public card built to share.",
			},
		],
	}),
	component: LandingPage,
});

const features = [
	{
		label: "01 / REDACTION",
		title: "Catches it. Refuses to keep it.",
		copy: "Secrets are redacted before storage, while the finding keeps enough context to act.",
		icon: ShieldCheck,
	},
	{
		label: "02 / COST AUTOPSY",
		title: "Find the expensive habits.",
		copy: "Duplicate calls and bloated context become waste dollars, measured or honestly estimated.",
		icon: DollarSign,
	},
	{
		label: "03 / ROAST SCORE",
		title: "One number. Zero ambiguity.",
		copy: "Security, reliability, and cost findings roll into a score from Rare to Charcoal.",
		icon: Gauge,
	},
	{
		label: "04 / SHARE CARDS",
		title: "Make the post-mortem travel.",
		copy: "Every roast gets a public URL and an unfurl made for the team chat.",
		icon: Copy,
	},
] as const;

function LandingPage() {
	const { roasts, available } = Route.useLoaderData();
	const liveHref = roasts[0]
		? `/r/${encodeURIComponent(roasts[0].slug)}`
		: "#live-roasts";

	return (
		<div className="landing">
			<header className="landing-nav">
				<div className="landing-nav__inner">
					<Logo inverse />
					<nav className="landing-nav__links" aria-label="Main navigation">
						<a href="#how-it-works">How it works</a>
						<a href="#live-roasts">Live roasts</a>
						<a href="/ai-agent-trace-analyzer">Trace analyzer</a>
					</nav>
					<div className="landing-nav__actions">
						<a className="nav-login" href="/login">
							Log in
						</a>
						<a className="button button--small" href="/app/new">
							Roast a trace <ArrowRight aria-hidden="true" />
						</a>
					</div>
				</div>
			</header>

			<main>
				<section className="hero" aria-labelledby="hero-title">
					<div className="hero__glow" />
					<div className="hero__inner">
						<div className="hero__copy">
							<a className="announcement reveal reveal--1" href="/app/new">
								<span>New</span> Live ingest from the OpenAI Agents SDK{" "}
								<ArrowRight />
							</a>
							<p className="eyebrow reveal reveal--2">
								Agent trace intelligence
							</p>
							<h1 id="hero-title" className="reveal reveal--3">
								Every trace tells on <em>your agent.</em>
							</h1>
							<p className="hero__lede reveal reveal--4">
								Upload an agent trace. Get a score, a cost autopsy, and a
								security flag list on a card built to be shared.
							</p>
							<div className="hero__actions reveal reveal--5">
								<a className="button" href="/app/new">
									Roast a trace <ArrowRight aria-hidden="true" />
								</a>
								<a className="button button--ghost" href={liveHref}>
									See a live roast
								</a>
							</div>
						</div>
						<DotMatrix />
					</div>
				</section>

				<section className="product-shot" aria-label="Roast0 product preview">
					<RoastProductShot />
					<p className="product-shot__caption">
						Real card UI · illustrative redacted demo trace
					</p>
				</section>

				<section className="features section-shell" id="how-it-works">
					<div className="section-heading">
						<p className="eyebrow">Four cuts. One diagnosis.</p>
						<h2>From raw trace to hard truth.</h2>
						<p>
							Built for the five seconds between “it passed” and “why did it do
							that?”
						</p>
					</div>
					<div className="feature-grid">
						{features.map(({ label, title, copy, icon: Icon }) => (
							<article className="feature-card" key={label}>
								<div className="feature-card__top">
									<DotGlyph />
									<Icon aria-hidden="true" />
								</div>
								<p className="mono-label">{label}</p>
								<h3>{title}</h3>
								<p>{copy}</p>
							</article>
						))}
					</div>
				</section>

				<section className="live-wall" id="live-roasts">
					<div className="section-shell">
						<div className="section-heading section-heading--row">
							<div>
								<p className="eyebrow">Live wall</p>
								<h2>Fresh from the fire.</h2>
							</div>
							<span
								className={`live-status${available ? "" : " live-status--offline"}`}
							>
								<i /> {available ? "Database live" : "Live data unavailable"}
							</span>
						</div>
						{roasts.length > 0 ? (
							<nav
								className="live-track"
								aria-label="Eight most recent public roasts"
							>
								{roasts.map((roast) => (
									<a
										className="live-roast"
										href={`/r/${encodeURIComponent(roast.slug)}`}
										key={roast.slug}
									>
										<div className="live-roast__score">{roast.score}</div>
										<div>
											<span>{roast.tier}</span>
											<h3>{roast.title}</h3>
											<p>
												{roast.roastLine ??
													"This trace is waiting for its last word."}
											</p>
										</div>
										<ArrowRight aria-hidden="true" />
									</a>
								))}
							</nav>
						) : (
							<div className="live-empty">
								<DotGlyph />
								<p>No public roasts yet. First trace gets the hottest seat.</p>
								<a href="/app/new">
									Roast the first trace <ArrowRight />
								</a>
							</div>
						)}
					</div>
				</section>
			</main>

			<footer className="landing-footer">
				<div className="section-shell landing-footer__inner">
					<Logo inverse />
					<p>Built at the OpenAI hackathon.</p>
					<a
						href="https://github.com/yagyaraj234/roast0"
						target="_blank"
						rel="noreferrer"
					>
						GitHub <ArrowRight aria-hidden="true" />
					</a>
				</div>
			</footer>
		</div>
	);
}
