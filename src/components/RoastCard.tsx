import type { CSSProperties } from "react";

import { fallbackRoastLine, type PublicRoast } from "../lib/public-roasts";
import { ShareButtons } from "./ShareButtons";
import { monoLabel } from "./ui";

type ScoreStyle = CSSProperties & { "--score-target": `${number}deg` };
type FindingGroup = {
	count: number;
	finding: PublicRoast["findings"][number];
	key: string;
};
type FixPlanItem = {
	count: number;
	detail: string;
	impact: string;
	key: string;
	title: string;
};

function money(value: number): string {
	return `$${value.toFixed(value < 10 ? 2 : 0)}`;
}

function tierSlug(tier: string): string {
	return tier.toLowerCase().replaceAll(" ", "-");
}

const tierChipStyles: Record<string, string> = {
	rare: "border-tier-rare/40 text-tier-rare",
	medium: "border-tier-medium/40 text-tier-medium",
	"well-done": "border-tier-welldone/40 text-tier-welldone",
	charcoal: "border-ink/40 text-ink",
};

function groupFindings(findings: PublicRoast["findings"]): FindingGroup[] {
	const groups = new Map<string, FindingGroup>();
	for (const finding of findings) {
		const key = [
			finding.rule,
			finding.category,
			finding.severity,
			finding.message,
		].join(" ");
		const group = groups.get(key);
		if (group) group.count += 1;
		else groups.set(key, { count: 1, finding, key });
	}
	return [...groups.values()];
}

export function fixForFinding(finding: PublicRoast["findings"][number]): {
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
					"Reliability: prevents runaway execution and repeated tool work.",
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
	const findingGroups = groupFindings(roast.findings);
	const findings = preview
		? findingGroups.slice(0, 1)
		: findingGroups.slice(0, 3);
	const findingCounts = roast.findings.reduce(
		(counts, finding) => {
			if (finding.severity === 3) counts.critical += 1;
			else if (finding.severity === 2) counts.warning += 1;
			else counts.notice += 1;
			return counts;
		},
		{ critical: 0, warning: 0, notice: 0 },
	);
	const fixes: FixPlanItem[] = preview
		? []
		: roast.detailedReport.actions.length > 0
			? roast.detailedReport.actions.slice(0, 4).map((action) => ({
					count: 1,
					detail: action.issue,
					impact: `${action.impact} Verify: ${action.verification}`,
					key: `assessment-${action.rule}`,
					title: action.fix,
				}))
			: findingGroups.slice(0, 4).map(({ count, finding, key }) => ({
					count,
					...fixForFinding(finding),
					key,
				}));
	const scoreStyle: ScoreStyle = {
		"--score-target": `${roast.score * 3.6}deg`,
		background:
			"conic-gradient(var(--color-accent) 0deg, var(--color-accent) var(--score-angle), var(--color-line) var(--score-angle), var(--color-line) 360deg)",
	};
	const tierChip =
		tierChipStyles[tierSlug(roast.tier)] ?? "border-ink/40 text-ink";

	return (
		<article
			className={
				preview
					? "bg-white p-6 sm:p-8"
					: "rounded-2xl border border-line bg-white p-6 shadow-[0_32px_80px_rgba(10,10,10,0.08)] sm:p-10"
			}
		>
			<div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
				<div>
					<p className={`${monoLabel} text-accent`}>
						{preview
							? "Demo trace · cost and risk report"
							: "Public trace report"}
					</p>
					<p className="mt-2.5 text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
						{roast.title}
					</p>
				</div>
				<span className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
					{roast.source}
				</span>
			</div>

			<div
				className={`grid items-center gap-7 ${preview ? "grid-cols-[auto_1fr] py-7" : "py-9 sm:grid-cols-[auto_1fr] sm:gap-10"}`}
			>
				<div
					className={`relative grid flex-none place-items-center rounded-full animate-score-fill ${preview ? "size-28" : "size-36 sm:size-44"}`}
					style={scoreStyle}
					role="img"
					aria-label={`Helix score: ${roast.score} out of 100`}
				>
					<div className="absolute inset-2 grid place-items-center rounded-full border border-line bg-white">
						<div className="flex items-baseline">
							<strong
								className={`font-mono font-medium tracking-[-0.08em] ${preview ? "text-4xl" : "text-5xl sm:text-6xl"}`}
							>
								{roast.score}
							</strong>
							<span
								className={`font-mono text-muted ${preview ? "text-[10px]" : "text-xs"}`}
							>
								/100
							</span>
						</div>
					</div>
				</div>
				<div className="min-w-0">
					<span
						className={`inline-flex rounded border px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.13em] ${tierChip}`}
					>
						{roast.tier}
					</span>
					{preview ? (
						<h2 className="mt-3.5 font-serif text-2xl italic leading-[1.08] tracking-[-0.02em] text-ink">
							“{line}”
						</h2>
					) : (
						<h1 className="mt-4 max-w-[690px] font-serif text-3xl italic leading-[1.08] tracking-[-0.02em] text-ink sm:text-[44px]">
							“{line}”
						</h1>
					)}
					<p className={`${monoLabel} mt-4 text-muted`}>
						{findingCounts.critical} critical · {findingCounts.warning} warning
						· {findingCounts.notice} notice
					</p>
					{!preview && <ShareButtons roast={roast} />}
				</div>
			</div>

			{!preview && (
				<section
					className="border-t border-line py-9"
					aria-labelledby="assessment-heading"
				>
					<SectionHeading
						id="assessment-heading"
						meta={
							roast.detailedReport.generated
								? (roast.detailedReport.model ?? "Luna")
								: "rule-based fallback"
						}
						title="Detailed assessment"
					/>
					<p className="max-w-[780px] text-[17px] leading-relaxed text-neutral-800">
						{roast.detailedReport.summary}
					</p>
				</section>
			)}

			<section
				className={
					preview ? "border-t border-line pt-6" : "border-t border-line py-9"
				}
				aria-labelledby={preview ? undefined : "findings-heading"}
			>
				{preview ? null : (
					<SectionHeading
						id={preview ? undefined : "findings-heading"}
						meta={`${roast.findings.length} signals · ${findingGroups.length} categories`}
						title="Findings"
					/>
				)}
				{findings.length > 0 ? (
					<ol className="divide-y divide-line border-y border-line">
						{findings.map(({ count, finding }) => (
							<li
								className={`grid gap-2.5 ${preview ? "py-3.5" : "py-5"} sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:gap-6`}
								key={`${finding.rule}-${finding.message}`}
							>
								<div className="flex flex-wrap items-start gap-1.5">
									<span className="rounded border border-accent/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
										SEV {finding.severity}
									</span>
									<span className="rounded border border-accent/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
										{finding.category}
									</span>
									{count > 1 && (
										<span className="rounded border border-accent/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
											seen {count}×
										</span>
									)}
								</div>
								<div className="min-w-0">
									<strong className="block text-sm font-semibold capitalize text-ink">
										{finding.rule.replaceAll("-", " ")}
									</strong>
									{preview ? null : (
										<p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
											{finding.message}
										</p>
									)}
								</div>
								{finding.estWasteUsd !== null && (
									<small className="font-mono text-[11px] text-muted">
										{money(finding.estWasteUsd)} waste
									</small>
								)}
							</li>
						))}
					</ol>
				) : (
					<p className="text-sm text-muted">
						No material finding in this trace.
					</p>
				)}
				{!preview && findingGroups.length > 3 && (
					<p className="mt-3.5 text-xs text-muted">
						+ {findingGroups.length - 3} lower-priority categories
					</p>
				)}
			</section>

			{!preview && (
				<>
					<section
						className="border-t border-line py-9"
						aria-labelledby="fixes-heading"
					>
						<SectionHeading
							id="fixes-heading"
							meta={`${fixes.length} highest-impact changes`}
							title="Fix plan"
						/>
						{fixes.length > 0 ? (
							<ol className="grid gap-2.5 sm:grid-cols-2">
								{fixes.map((fix, index) => (
									<li
										className="grid grid-cols-[auto_minmax(0,1fr)] gap-3.5 rounded-lg border border-line bg-surface-alt/60 p-4.5"
										key={fix.key}
									>
										<span className="font-mono text-[10px] text-accent">
											{String(index + 1).padStart(2, "0")}
										</span>
										<div className="min-w-0">
											<strong className="block text-sm font-semibold text-ink">
												{fix.title}
											</strong>
											<p className="mt-1.5 mb-2 text-xs leading-relaxed text-neutral-600">
												{fix.detail}
											</p>
											<small className="font-mono text-[10px] leading-relaxed text-muted">
												{fix.count > 1 ? `${fix.count} occurrences · ` : ""}
												{fix.impact}
											</small>
										</div>
									</li>
								))}
							</ol>
						) : (
							<p className="text-sm text-muted">
								No repair work identified in this trace.
							</p>
						)}
					</section>

					<section
						className="border-t border-line py-9"
						aria-labelledby="cost-heading"
					>
						<SectionHeading
							id="cost-heading"
							meta={`${roast.cost.tokenSource} usage`}
							title="Cost autopsy"
						/>
						<div className="grid border-t border-l border-line sm:grid-cols-4">
							<CostCell
								label="Total spend"
								value={money(roast.cost.totalUsd)}
							/>
							<CostCell
								hot
								label="Waste found"
								value={money(roast.cost.wasteUsd)}
							/>
							<CostCell
								label="Monthly waste"
								value={money(roast.cost.monthlyProjectionUsd)}
							/>
							<CostCell
								label="Tokens"
								value={(
									roast.cost.totalTokensIn + roast.cost.totalTokensOut
								).toLocaleString("en-US")}
							/>
						</div>
						<p className="mt-3 text-right font-mono text-[10px] text-muted">
							{roast.cost.projectionAssumption}
						</p>
					</section>

					<details className="border-t border-line">
						<summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 [&::-webkit-details-marker]:hidden">
							<span className="text-xl font-semibold tracking-[-0.02em] text-ink">
								Trace timeline
							</span>
							<small className={`${monoLabel} text-muted`}>
								{roast.timeline.length} spans · expand
							</small>
						</summary>
						{roast.timeline.length > 0 ? (
							<ol className="pb-2">
								{roast.timeline.map((span, index) => (
									<li
										className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-3.5 border-t border-line py-3.5 sm:grid-cols-[34px_minmax(0,1fr)_auto]"
										key={span.id}
									>
										<span className="font-mono text-[10px] text-muted">
											{String(index + 1).padStart(2, "0")}
										</span>
										<div className="min-w-0">
											<strong className="block truncate text-sm font-medium text-ink">
												{span.name}
											</strong>
											<small className="mt-0.5 block font-mono text-[10px] text-muted">
												{span.model ?? span.type}
											</small>
										</div>
										<code className="col-start-2 font-mono text-[10px] text-muted sm:col-start-auto">
											{spanMeta(span.tokensIn, span.tokensOut, span.durationMs)}
										</code>
									</li>
								))}
							</ol>
						) : (
							<p className="pb-6 text-sm text-muted">
								No normalized spans available.
							</p>
						)}
					</details>
				</>
			)}
		</article>
	);
}

function SectionHeading({
	id,
	meta,
	title,
}: {
	id?: string;
	meta: string;
	title: string;
}) {
	return (
		<div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
			<h2 className="text-xl font-semibold tracking-[-0.02em] text-ink" id={id}>
				{title}
			</h2>
			<span className={`${monoLabel} text-muted`}>{meta}</span>
		</div>
	);
}

function CostCell({
	hot = false,
	label,
	value,
}: {
	hot?: boolean;
	label: string;
	value: string;
}) {
	return (
		<div
			className={`min-w-0 border-r border-b border-line p-5 ${hot ? "bg-accent-soft" : ""}`}
		>
			<span className={`${monoLabel} block text-muted`}>{label}</span>
			<strong
				className={`mt-2.5 block truncate font-mono text-2xl font-medium tracking-[-0.04em] sm:text-3xl ${hot ? "text-accent" : "text-ink"}`}
			>
				{value}
			</strong>
		</div>
	);
}
