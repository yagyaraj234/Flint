import type { PublicRoast } from "../lib/public-roasts";
import { RoastCard } from "./RoastCard";

const demoRoast: PublicRoast = {
	slug: "demo-trace",
	title: "Wasteful support agent",
	source: "OpenAI Agents",
	score: 38,
	tier: "Well Done",
	roastLine: "Your agent paid twice for the same thought.",
	createdAt: null,
	traceId: "trace_demo",
	visibility: "public",
	isOwner: false,
	findings: [
		{
			rule: "duplicate-llm-call",
			category: "cost",
			severity: 2,
			message: "The same LLM input was sent twice.",
			estWasteUsd: 2.17,
		},
		{
			rule: "tool-loop",
			category: "reliability",
			severity: 2,
			message: "The same tool call repeated four times.",
			estWasteUsd: null,
		},
		{
			rule: "leaked-secret",
			category: "security",
			severity: 3,
			message: "An exposed credential was redacted before storage.",
			estWasteUsd: null,
		},
	],
	cost: {
		totalTokensIn: 18200,
		totalTokensOut: 6400,
		totalUsd: 3.84,
		wasteUsd: 2.17,
		tokenSource: "measured",
		monthlyProjectionUsd: 65100,
		projectionAssumption: "at 1,000 runs/day",
		unpricedModels: [],
	},
	detailedReport: {
		summary:
			"Duplicate model calls and repeated tools drove avoidable cost; one credential was redacted.",
		actions: [],
		generated: false,
		model: null,
	},
	timeline: [],
};

export function RoastProductShot() {
	return (
		<div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_35px_90px_rgba(10,10,10,0.14)]">
			<div className="flex items-center gap-3 border-b border-line bg-surface-alt px-4 py-3">
				<div className="flex gap-1.5" aria-hidden="true">
					<span className="size-2.5 rounded-full bg-[#ff5f57]" />
					<span className="size-2.5 rounded-full bg-[#febc2e]" />
					<span className="size-2.5 rounded-full bg-[#28c840]" />
				</div>
				<div className="mx-auto flex min-w-0 items-center rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[11px] text-muted">
					helix.trevyn.dev/r/demo-trace
				</div>
				<div aria-hidden="true" className="w-9 flex-none" />
			</div>
			<RoastCard roast={demoRoast} preview />
		</div>
	);
}
