import type { CSSProperties } from "react";

import { fallbackRoastLine, type PublicRoast } from "../lib/public-roasts";
import { ShareButtons } from "./ShareButtons";

type ScoreStyle = CSSProperties & { "--score-target": `${number}deg` };

function money(value: number): string {
	return `$${value.toFixed(value < 10 ? 2 : 0)}`;
}

function tierSlug(tier: string): string {
	return tier.toLowerCase().replaceAll(" ", "-");
}

function fixForFinding(finding: PublicRoast["findings"][number]): {
	title: string;
	detail: string;
	impact: string;
} {
	const waste =
		finding.estWasteUsd !== null && finding.estWasteUsd > 0
			? `${money(finding.estWasteUsd)} estimated waste per run.`
			: "Measure again after the change to confirm savings.";
	switch (finding.rule) {
		case "leaked-secret":
			return {
				title: "Rotate exposed credentials",
				detail:
					"Revoke this key, move it into server-only secrets, and pass a scoped reference instead of the value.",
				impact: "Security: blocks account takeover and surprise API bills.",
			};
		case "pii-in-prompt":
			return {
				title: "Remove PII before the prompt",
				detail:
					"Redact customer identifiers at ingestion and pass a stable internal reference to the model instead.",
				impact:
					"Security: reduces privacy exposure in model logs and downstream tools.",
			};
		case "insecure-url":
			return {
				title: "Require secure tool URLs",
				detail:
					"Replace the HTTP endpoint with HTTPS and reject insecure destinations before the tool call starts.",
				impact:
					"Security: protects trace data while it moves between services.",
			};
		case "duplicate-llm-call":
			return {
				title: "Deduplicate the LLM request",
				detail:
					"Cache identical in-flight requests and reuse the first response before calling the model again.",
				impact: `Cost: ${waste}`,
			};
		case "repeated-bloat":
			return {
				title: "Stop resending static context",
				detail:
					"Keep the shared instructions on the agent and send only the small state delta on each call.",
				impact: `Cost: ${waste}`,
			};
		case "context-stuffing":
			return {
				title: "Trim context before inference",
				detail:
					"Retrieve only relevant chunks, summarize old turns, and cap the prompt budget before model dispatch.",
				impact:
					"Cost and latency: smaller prompts make every call cheaper and faster.",
			};
		case "tool-loop":
			return {
				title: "Bound retries and repeated tools",
				detail:
					"Hash tool arguments, stop duplicates, and require a changed input before retrying the same call.",
				impact:
					"Reliability: prevents runaway execution and compounding tool cost.",
			};
		case "error-tail":
			return {
				title: "Handle the final failing step",
				detail:
					"Classify the tool error, return a safe fallback, and stop the workflow instead of continuing blindly.",
				impact:
					"Reliability: removes failed runs that still consume tokens and tools.",
			};
		default:
			return {
				title: `Fix ${finding.rule.replaceAll("-", " ")}`,
				detail:
					"Change the flagged step, then rerun this trace to verify the finding is gone.",
				impact:
					finding.category === "cost"
						? `Cost: ${waste}`
						: "Verify with a clean rerun.",
			};
	}
}

function spanMeta(
	tokensIn: number | null,
	tokensOut: number | null,
	durationMs: number | null,
) {
	const tokens =
		tokensIn === null && tokensOut === null
			? "tokens n/a"
			: `${(tokensIn ?? 0) + (tokensOut ?? 0)} tok`;
	const duration =
		durationMs === null
			? "duration n/a"
			: durationMs >= 1000
				? `${(durationMs / 1000).toFixed(1)}s`
				: `${durationMs}ms`;
	return `${tokens} · ${duration}`;
}

export function RoastCard({
	roast,
	preview = false,
}: {
	roast: PublicRoast;
	preview?: boolean;
}) {
	const line = roast.roastLine ?? fallbackRoastLine(roast.tier);
	const findings = preview
		? roast.findings.slice(0, 1)
		: roast.findings.slice(0, 3);
	const findingCounts = roast.findings.reduce(
		(counts, finding) => {
			if (finding.severity === 3) counts.critical += 1;
			else if (finding.severity === 2) counts.warning += 1;
			else counts.notice += 1;
			return counts;
		},
		{ critical: 0, warning: 0, notice: 0 },
	);
	const fixes = preview ? [] : roast.findings.slice(0, 4).map(fixForFinding);
	const scoreStyle: ScoreStyle = {
		"--score-target": `${roast.score * 3.6}deg`,
	};

	return (
		<article className={`public-card${preview ? " public-card--preview" : ""}`}>
			<div className="public-card__topline">
				<div>
					<p className="mono-label">
						{preview ? "DEMO TRACE · LIVE CARD MARKUP" : "PUBLIC TRACE REPORT"}
					</p>
					<p className="public-card__title">{roast.title}</p>
				</div>
				<span className="source-chip">{roast.source}</span>
			</div>

			<div className="public-verdict">
				<div
					className="score-ring"
					style={scoreStyle}
					role="img"
					aria-label={`Flint score: ${roast.score} out of 100`}
				>
					<div>
						<strong>{roast.score}</strong>
						<span>/100</span>
					</div>
				</div>
				<div className="public-verdict__copy">
					<span className="tier-chip" data-tier={tierSlug(roast.tier)}>
						{roast.tier}
					</span>
					{preview ? <h2>“{line}”</h2> : <h1>“{line}”</h1>}
					<p className="mono-label">
						{findingCounts.critical} critical · {findingCounts.warning} warning
						· {findingCounts.notice} notice
					</p>
					{!preview && <ShareButtons roast={roast} />}
				</div>
			</div>

			<section
				className="public-findings"
				aria-labelledby={preview ? undefined : "findings-heading"}
			>
				<div className="card-section-heading">
					<h2 id={preview ? undefined : "findings-heading"}>Findings</h2>
					<span>{roast.findings.length} total</span>
				</div>
				{findings.length > 0 ? (
					<ol>
						{findings.map((finding) => (
							<li key={`${finding.rule}-${finding.message}`}>
								<div className="finding-tags">
									<span>SEV {finding.severity}</span>
									<span>{finding.category}</span>
								</div>
								<div>
									<strong>{finding.rule.replaceAll("-", " ")}</strong>
									<p>{finding.message}</p>
								</div>
								{finding.estWasteUsd !== null && (
									<small>{money(finding.estWasteUsd)} waste</small>
								)}
							</li>
						))}
					</ol>
				) : (
					<p className="card-empty-row">No material finding in this trace.</p>
				)}
				{!preview && roast.findings.length > 3 && (
					<p className="finding-overflow">
						+ {roast.findings.length - 3} lower-priority findings
					</p>
				)}
			</section>

			{!preview && (
				<>
					<section className="public-fixes" aria-labelledby="fixes-heading">
						<div className="card-section-heading">
							<h2 id="fixes-heading">Fix plan</h2>
							<span>{fixes.length} highest-impact changes</span>
						</div>
						{fixes.length > 0 ? (
							<ol>
								{fixes.map((fix, index) => (
									<li key={roast.findings[index].rule}>
										<span>{String(index + 1).padStart(2, "0")}</span>
										<div>
											<strong>{fix.title}</strong>
											<p>{fix.detail}</p>
											<small>{fix.impact}</small>
										</div>
									</li>
								))}
							</ol>
						) : (
							<p className="card-empty-row">
								No repair work identified in this trace.
							</p>
						)}
					</section>

					<section className="public-cost" aria-labelledby="cost-heading">
						<div className="card-section-heading">
							<h2 id="cost-heading">Cost autopsy</h2>
							<span>{roast.cost.tokenSource} usage</span>
						</div>
						<div className="cost-grid">
							<div>
								<span>Total spend</span>
								<strong>{money(roast.cost.totalUsd)}</strong>
							</div>
							<div className="cost-grid__hot">
								<span>Waste found</span>
								<strong>{money(roast.cost.wasteUsd)}</strong>
							</div>
							<div>
								<span>Monthly waste</span>
								<strong>{money(roast.cost.monthlyProjectionUsd)}</strong>
							</div>
							<div>
								<span>Tokens</span>
								<strong>
									{(
										roast.cost.totalTokensIn + roast.cost.totalTokensOut
									).toLocaleString("en-US")}
								</strong>
							</div>
						</div>
						<p>{roast.cost.projectionAssumption}</p>
					</section>

					<details className="public-timeline">
						<summary>
							<span>Trace timeline</span>
							<small>{roast.timeline.length} spans · expand</small>
						</summary>
						{roast.timeline.length > 0 ? (
							<ol>
								{roast.timeline.map((span, index) => (
									<li key={span.id}>
										<span>{String(index + 1).padStart(2, "0")}</span>
										<div>
											<strong>{span.name}</strong>
											<small>{span.model ?? span.type}</small>
										</div>
										<code>
											{spanMeta(span.tokensIn, span.tokensOut, span.durationMs)}
										</code>
									</li>
								))}
							</ol>
						) : (
							<p className="card-empty-row">No normalized spans available.</p>
						)}
					</details>
				</>
			)}
		</article>
	);
}
