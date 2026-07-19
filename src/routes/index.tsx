import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Logo } from "../components/Logo";
import { RoastProductShot } from "../components/RoastProductShot";
import { monoLabel } from "../components/ui";
import { getCurrentUser } from "../lib/auth.functions";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		if (await getCurrentUser()) throw redirect({ to: "/app" });
	},
	head: () => ({
		meta: [
			{ title: "Helix — AI Agent Cost & Risk Scanner" },
			{
				name: "description",
				content:
					"Helix scans AI agent traces for duplicate model calls, bloated prompts, tool loops, failed steps, and exposed credentials, then shows what to fix.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
			},
		],
	}),
	component: LandingPage,
});

const catches = [
	"Duplicate LLM calls and repeated 2,000+ token prompt prefixes",
	"Single calls with more than 20k input tokens",
	"The same tool called 4+ times with identical arguments",
	"Failed tools with no later retry",
	"Steps that run longer than 15 seconds",
	"Traces that end in an unhandled error",
	"API keys, bearer tokens, and private keys in trace data",
	"Emails, phone numbers, and plain-HTTP tool URLs",
] as const;

function LandingPage() {
	return (
		<div className="min-h-screen bg-white font-landing text-ink">
			<header className="absolute inset-x-0 top-0 z-10">
				<div className="mx-auto flex h-20 w-full max-w-[1100px] items-center justify-between px-6">
					<Logo />
					<nav
						className="hidden items-center gap-8 text-[15px] text-neutral-600 md:flex"
						aria-label="Main navigation"
					>
						<a
							className="transition-colors duration-150 hover:text-ink"
							href="#what-it-catches"
						>
							What it finds
						</a>
						<a
							className="transition-colors duration-150 hover:text-ink"
							href="/ai-agent-trace-analyzer"
						>
							Trace analyzer
						</a>
						<a
							className="transition-colors duration-150 hover:text-ink"
							href="https://github.com/yagyaraj234/Helix"
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</a>
					</nav>
					<div className="flex items-center gap-5">
						<a
							className="hidden text-[15px] text-neutral-600 transition-colors duration-150 hover:text-ink sm:block"
							href="/login"
						>
							Log in
						</a>
						<a
							className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition duration-150 ease-out hover:bg-neutral-800 active:scale-[0.97]"
							href="/app/new"
						>
							Analyze a trace
						</a>
					</div>
				</div>
			</header>

			<main>
				<section
					className="mx-auto flex w-full max-w-[880px] flex-col items-center px-6 pt-40 text-center md:pt-48"
					aria-labelledby="hero-title"
				>
					<p
						className={`${monoLabel} mb-4 text-accent opacity-0 animate-reveal`}
					>
						AI AGENT COST &amp; RISK SCANNER
					</p>
					<h1
						id="hero-title"
						className="text-balance font-sans text-[clamp(44px,7.5vw,88px)] font-bold leading-[1.04] tracking-[-0.045em] opacity-0 animate-reveal"
					>
						See where your agents{" "}
						<span className="text-accent">waste money.</span>
					</h1>
					<p className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted opacity-0 animate-reveal [animation-delay:90ms] md:text-[21px]">
						Helix scans agent traces for duplicate model calls, bloated prompts,
						tool loops, failed steps, and exposed credentials. Then it shows
						what to fix.
					</p>
					<a
						className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-line bg-white px-6 py-3 text-lg font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-150 ease-out hover:border-neutral-300 hover:bg-surface-alt active:scale-[0.97] opacity-0 animate-reveal [animation-delay:180ms]"
						href="/app/new"
					>
						Analyze a trace <ArrowRight size={18} aria-hidden="true" />
					</a>
				</section>

				<section
					className="mx-auto w-full max-w-[1100px] px-6 pt-24 pb-28"
					aria-label="Helix product preview"
				>
					<RoastProductShot />
					<p
						className={`${monoLabel} mt-4 text-center text-neutral-400 normal-case tracking-[0.1em]`}
					>
						Example report · demo trace
					</p>
				</section>

				<section className="border-t border-line" id="what-it-catches">
					<div className="mx-auto w-full max-w-[1100px] px-6 py-12">
						<div className="max-w-xl">
							<h2 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">
								What costs money. What can break.
							</h2>
							<p className="mt-4 text-lg leading-relaxed text-muted">
								Deterministic cost, reliability, and security checks for
								completed agent traces.
							</p>
						</div>
						<ul className="mt-14 grid border-t border-l border-line sm:grid-cols-2">
							{catches.map((item) => (
								<li
									className="relative border-r border-b border-line py-5 pr-6 pl-11 text-sm leading-relaxed text-neutral-700"
									key={item}
								>
									<span
										aria-hidden="true"
										className="absolute top-[1.6rem] left-5 size-1.5 rounded-full bg-accent"
									/>
									{item}
								</li>
							))}
						</ul>
					</div>
				</section>
			</main>

			<footer className="relative overflow-hidden">
				<img
					alt=""
					className="absolute inset-0 h-full w-full object-cover"
					src="/footer-field.jpeg"
				/>
				<div
					aria-hidden="true"
					className="absolute inset-0 bg-gradient-to-b from-white via-white/15 to-transparent"
				/>
				<div className="relative mx-auto flex w-full max-w-[1100px] flex-col px-6 pt-32 md:py-44">
					<p className="max-w-md text-3xl font-semibold tracking-[-0.03em] text-ink md:text-4xl">
						Find the waste in your first trace.
					</p>
					<div className="mt-6">
						<a
							className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition duration-150 ease-out hover:bg-neutral-800 active:scale-[0.97]"
							href="/app/new"
						>
							Analyze a trace <ArrowRight size={15} aria-hidden="true" />
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}
