import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	ArrowRight,
	Copy,
	DollarSign,
	PlugZap,
	Repeat2,
	ShieldCheck,
} from "lucide-react";

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
			{ title: "Flint — Security scanning for AI agent traces" },
			{
				name: "description",
				content:
					"Flint scans every agent trace for leaked secrets, unsafe tool calls, and runaway costs, then redacts what it finds before storing anything.",
			},
		],
	}),
	component: LandingPage,
});

const features = [
	{
		label: "01 / SECURITY",
		title: "Detect and redact in one pass",
		copy: "Flint catches supported secrets in trace data and replaces them before storage.",
		icon: ShieldCheck,
	},
	{
		label: "02 / RELIABILITY",
		title: "Loop and failure flags",
		copy: "Repeated tool calls and error tails become concrete findings, not dashboard noise.",
		icon: Repeat2,
	},
	{
		label: "03 / COST",
		title: "Cost autopsy, measured vs estimated",
		copy: "Duplicate calls and bloated context show their waste with the source of each number.",
		icon: DollarSign,
	},
	{
		label: "04 / DISTRIBUTION",
		title: "Roast cards for the timeline",
		copy: "Every scan has a shareable report card for the people who need to see it.",
		icon: Copy,
	},
] as const;

const catches = [
	"OpenAI, AWS, GitHub, Slack, and Google API keys in span inputs, outputs, and tool arguments",
	"JWTs, bearer tokens, and private key blocks",
	"Emails and phone numbers passed through prompts",
	"Plain-http URLs in tool calls",
	"The same tool called 4+ times with identical arguments",
	"Traces that end in an unhandled error",
	"Duplicate LLM calls and repeated 2,000+ token prompt prefixes",
	"Single calls stuffed past 20k input tokens",
] as const;

function LandingPage() {
	const { roasts, available } = Route.useLoaderData();
	const liveHref = roasts[0]
		? `/r/${encodeURIComponent(roasts[0].slug)}`
		: "#live-reports";

	return (
		<div className="landing">
			<header className="landing-nav">
				<div className="landing-nav__inner">
					<Logo inverse />
					<nav className="landing-nav__links" aria-label="Main navigation">
						<a href="#what-flint-catches">What Flint catches</a>
						<a href="#integrations">Integrations</a>
						<a href="#live-reports">Live reports</a>
						<a href="/ai-agent-trace-analyzer">Trace analyzer</a>
					</nav>
					<div className="landing-nav__actions">
						<a className="nav-login" href="/login">
							Log in
						</a>
						<a className="button button--small" href="/app/new">
							Scan a trace <ArrowRight aria-hidden="true" />
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
								Security scanning for AI agent traces
							</p>
							<h1 id="hero-title" className="reveal reveal--3">
								Catch what your agents <em>leak.</em>
							</h1>
							<p className="hero__lede reveal reveal--4">
								Flint scans every agent trace for leaked secrets, unsafe tool
								calls, and runaway costs, then redacts what it finds before
								storing anything.
							</p>
							<div className="hero__actions reveal reveal--5">
								<a className="button" href="/app/new">
									Scan a trace <ArrowRight aria-hidden="true" />
								</a>
								<a className="button button--ghost" href={liveHref}>
									See a live report
								</a>
							</div>
						</div>
						<DotMatrix />
					</div>
				</section>

				<section className="product-shot" aria-label="Flint product preview">
					<RoastProductShot />
					<p className="product-shot__caption">
						Live report UI · illustrative redacted demo trace
					</p>
				</section>

				<section className="integration-pulse section-shell" id="integrations">
					<div className="integration-pulse__copy">
						<p className="eyebrow">Integrations / LangSmith</p>
						<h2>Put your trace telemetry to work.</h2>
						<p>
							Connect LangSmith once and Flint keeps reviewing completed traces
							for secrets, brittle runs, and waste—without storing a raw
							credential.
						</p>
						<a className="button" href="/app/integrations/langsmith/new">
							Connect LangSmith <ArrowRight aria-hidden="true" />
						</a>
					</div>
					<article className="integration-pulse__card">
						<div className="integration-pulse__card-top">
							<span className="integration-pulse__mark">
								<PlugZap aria-hidden="true" />
							</span>
							<span>Available now</span>
						</div>
						<h3>LangSmith</h3>
						<p>
							Continuous redacted scans for the traces already in your
							workspace.
						</p>
						<dl>
							<div>
								<dt>First pass</dt>
								<dd>24 hours / 50 traces</dd>
							</div>
							<div>
								<dt>Then</dt>
								<dd>Hourly scan cadence</dd>
							</div>
							<div>
								<dt>Credentials</dt>
								<dd>Encrypted server-side</dd>
							</div>
						</dl>
					</article>
				</section>

				<section
					className="findings-list section-shell"
					id="what-flint-catches"
				>
					<div className="section-heading">
						<p className="eyebrow">Deterministic checks</p>
						<h2>What Flint catches</h2>
						<p>
							Concrete rules for trace data that should never reach production.
						</p>
					</div>
					<ul className="findings-list__items">
						{catches.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</section>

				<section className="features section-shell" id="how-it-works">
					<div className="section-heading">
						<p className="eyebrow">One trace, clear findings</p>
						<h2>Find what will hurt you.</h2>
						<p>
							Security first. Reliability and cost next. Shareable evidence
							last.
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

				<section className="live-wall" id="live-reports">
					<div className="section-shell">
						<div className="section-heading section-heading--row">
							<div>
								<p className="eyebrow">Live reports</p>
								<h2>Recent scans.</h2>
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
								aria-label="Eight most recent public reports"
							>
								{roasts.map((roast) => (
									<a
										className="live-roast"
										href={`/r/${encodeURIComponent(roast.slug)}`}
										key={roast.slug}
									>
										<div className="live-roast__score">{roast.score}</div>
										<div>
											<span>Flint score</span>
											<h3>{roast.title}</h3>
											<p>Public report ready to review.</p>
										</div>
										<ArrowRight aria-hidden="true" />
									</a>
								))}
							</nav>
						) : (
							<div className="live-empty">
								<DotGlyph />
								<p>No public reports yet. Scan the first trace.</p>
								<a href="/app/new">
									Scan a trace <ArrowRight />
								</a>
							</div>
						)}
					</div>
				</section>
			</main>

			<footer className="landing-footer">
				<div className="section-shell landing-footer__inner">
					<Logo inverse />
					<p>Flint. Security scanning for AI agent traces.</p>
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
