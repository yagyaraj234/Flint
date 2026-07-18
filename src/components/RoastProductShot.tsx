import type { PublicRoast } from "../lib/public-roasts";
import { RoastCard } from "./RoastCard";

const demoRoast: PublicRoast = {
	slug: "demo-trace",
	title: "Leaky support agent",
	source: "OpenAI Agents",
	score: 12,
	tier: "Charcoal",
	roastLine: "Your agent put the API key on speakerphone.",
	createdAt: null,
	traceId: "trace_demo",
	visibility: "public",
	isOwner: false,
	findings: [
		{
			rule: "leaked-secret",
			category: "security",
			severity: 3,
			message: "Redacted before this trace reached storage.",
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
		summary: "A credential reached a tool call.",
		actions: [],
		generated: false,
		model: null,
	},
	timeline: [],
};

export function RoastProductShot() {
	return (
		<div className="browser-frame">
			<div className="browser-frame__bar">
				<span />
				<span />
				<span />
				<div>flint.example/r/demo-trace</div>
			</div>
			<RoastCard roast={demoRoast} preview />
		</div>
	);
}
