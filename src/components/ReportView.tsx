import {
	fallbackRoastLine,
	type PublicFinding,
	type PublicFindingCategory,
	type PublicRoast,
} from "../lib/public-roasts";
import { fixForFinding } from "./RoastCard";
import { ShareButtons } from "./ShareButtons";
import { ShareDialog } from "./ShareDialog";
import { monoLabel } from "./ui";

const categoryOrder: PublicFindingCategory[] = [
	"security",
	"reliability",
	"cost",
];

function formatDate(value: string | null): string {
	if (!value) return "date unavailable";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "date unavailable"
		: new Intl.DateTimeFormat("en-US", {
				day: "numeric",
				month: "short",
				timeZone: "UTC",
				year: "numeric",
			}).format(date);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US").format(value);
}

function formatUsd(value: number): string {
	return new Intl.NumberFormat("en-US", {
		currency: "USD",
		minimumFractionDigits: 2,
		style: "currency",
	}).format(value);
}

function scoreGrade(score: number): "good" | "warning" | "critical" {
	if (score >= 80) return "good";
	if (score >= 50) return "warning";
	return "critical";
}

const gradeStyles = {
	critical: "text-danger",
	good: "text-tier-rare",
	warning: "text-tier-medium",
} as const;

function severityLabel(severity: PublicFinding["severity"]): string {
	if (severity === 3) return "High";
	if (severity === 2) return "Medium";
	return "Low";
}

const severityStyles: Record<string, string> = {
	High: "border-danger/50 text-danger",
	Medium: "border-tier-medium/50 text-tier-medium",
	Low: "border-neutral-300 text-muted",
};

function spanMeta(
	tokensIn: number | null,
	tokensOut: number | null,
	durationMs: number | null,
): string {
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

export function ReportView({ roast }: { roast: PublicRoast }) {
	const line = roast.roastLine ?? fallbackRoastLine(roast.tier);
	const findingGroups = categoryOrder.flatMap((category) => {
		const findings = roast.findings
			.filter((finding) => finding.category === category)
			.sort((left, right) => right.severity - left.severity);
		return findings.length > 0 ? [{ category, findings }] : [];
	});
	const remediationActions =
		roast.detailedReport.actions.length > 0
			? roast.detailedReport.actions.map((action) => ({
					detail: action.verification,
					detailLabel: "Verification",
					fix: action.fix,
					impact: action.impact,
					issue: action.issue,
					rule: action.rule,
				}))
			: roast.findings.map((finding) => {
					const fallback = fixForFinding(finding);
					return {
						detail: fallback.detail,
						detailLabel: "Implementation",
						fix: fallback.title,
						impact: fallback.impact,
						issue: finding.message,
						rule: finding.rule,
					};
				});

	return (
		<article className="mx-auto w-full max-w-[760px] rounded-2xl border border-line bg-white p-6 text-ink shadow-[0_24px_64px_rgba(10,10,10,0.09)] sm:p-12">
			<header className="grid items-start gap-8 pb-9 opacity-0 animate-enter sm:grid-cols-[minmax(0,1fr)_auto]">
				<div>
					<p className={`${monoLabel} text-muted`}>Trace report</p>
					<h1 className="mt-2.5 text-3xl font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-5xl">
						{roast.title}
					</h1>
					<p
						className={`${monoLabel} mt-4 normal-case tracking-normal text-muted`}
					>
						{roast.source} · {formatDate(roast.createdAt)} · {roast.traceId}
					</p>
					<ShareButtons roast={roast} />
					<ShareDialog slug={roast.slug} isOwner={roast.isOwner} />
				</div>
				<div
					className={`flex flex-col items-start sm:items-end ${gradeStyles[scoreGrade(roast.score)]}`}
				>
					<strong className="font-mono text-6xl font-semibold leading-[0.9] tracking-[-0.08em] sm:text-7xl">
						{roast.score}
					</strong>
					<span className="mt-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">
						/ 100 · {roast.tier}
					</span>
				</div>
			</header>

			<section
				className="border-t border-line py-9 opacity-0 animate-enter [animation-delay:40ms]"
				aria-labelledby="report-summary-heading"
			>
				<p className={`${monoLabel} text-muted`}>Executive summary</p>
				<h2
					className="mt-2 mb-5 text-2xl font-semibold tracking-[-0.02em]"
					id="report-summary-heading"
				>
					Assessment
				</h2>
				<p className="text-[17px] leading-[1.7]">
					{roast.detailedReport.summary}
				</p>
				{!roast.detailedReport.generated && (
					<p className="mt-3.5 text-xs leading-relaxed text-muted">
						Generated assessment unavailable. This summary uses deterministic
						trace findings.
					</p>
				)}
			</section>

			<section
				className="border-t border-line py-9 opacity-0 animate-enter [animation-delay:80ms]"
				aria-labelledby="report-findings-heading"
			>
				<p className={`${monoLabel} text-muted`}>Evidence</p>
				<h2
					className="mt-2 mb-5 text-2xl font-semibold tracking-[-0.02em]"
					id="report-findings-heading"
				>
					Findings
				</h2>
				{findingGroups.length > 0 ? (
					<div className="grid gap-7">
						{findingGroups.map(({ category, findings }) => (
							<section key={category} aria-labelledby={`category-${category}`}>
								<h3
									className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted"
									id={`category-${category}`}
								>
									{category}
								</h3>
								<ul className="border-t border-line">
									{findings.map((finding) => (
										<li
											className="grid gap-2.5 border-b border-line py-4 sm:grid-cols-[138px_minmax(0,1fr)] sm:gap-4.5"
											key={`${finding.rule}-${finding.message}-${finding.severity}`}
										>
											<div className="flex flex-wrap items-start gap-2 sm:flex-col">
												<span
													className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold ${severityStyles[severityLabel(finding.severity)]}`}
												>
													{severityLabel(finding.severity)}
												</span>
												<code className="font-mono text-[10px] break-anywhere text-muted">
													{finding.rule}
												</code>
											</div>
											<p className="text-sm leading-relaxed">
												{finding.message}
											</p>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				) : (
					<p className="text-xs text-muted">
						No material findings in this trace.
					</p>
				)}
			</section>

			<section
				className="border-t border-line py-9 opacity-0 animate-enter [animation-delay:120ms]"
				aria-labelledby="report-actions-heading"
			>
				<p className={`${monoLabel} text-muted`}>Remediation</p>
				<h2
					className="mt-2 mb-5 text-2xl font-semibold tracking-[-0.02em]"
					id="report-actions-heading"
				>
					Recommended actions
				</h2>
				{remediationActions.length > 0 ? (
					<div className="grid gap-4.5">
						{remediationActions.map((action) => (
							<dl
								className="relative grid gap-3.5 rounded-lg border border-line bg-paper p-5.5"
								key={`${action.rule}-${action.issue}-${action.fix}`}
							>
								<ActionRow label="Issue" value={action.issue} />
								<ActionRow label="Impact" value={action.impact} />
								<ActionRow label="Fix" value={action.fix} />
								<ActionRow label={action.detailLabel} value={action.detail} />
								<code className="font-mono text-[10px] break-anywhere text-muted sm:absolute sm:top-5.5 sm:right-5.5">
									{action.rule}
								</code>
							</dl>
						))}
					</div>
				) : (
					<p className="text-xs text-muted">No remediation actions required.</p>
				)}
			</section>

			<section
				className="border-t border-line py-9 opacity-0 animate-enter [animation-delay:160ms]"
				aria-labelledby="report-cost-heading"
			>
				<p className={`${monoLabel} text-muted`}>
					Usage and waste · {roast.cost.tokenSource} usage
				</p>
				<h2
					className="mt-2 mb-5 text-2xl font-semibold tracking-[-0.02em]"
					id="report-cost-heading"
				>
					Cost
				</h2>
				<dl className="grid border-t border-l border-line sm:grid-cols-2">
					<ReportCostCell
						label="Tokens in"
						value={formatNumber(roast.cost.totalTokensIn)}
					/>
					<ReportCostCell
						label="Tokens out"
						value={formatNumber(roast.cost.totalTokensOut)}
					/>
					<ReportCostCell
						label="Total cost"
						value={formatUsd(roast.cost.totalUsd)}
					/>
					<ReportCostCell
						label="Estimated waste"
						value={formatUsd(roast.cost.wasteUsd)}
					/>
					<div className="border-r border-b border-line bg-paper p-4.5 sm:col-span-2">
						<dt className={`${monoLabel} text-muted`}>Monthly projection</dt>
						<dd className="mt-2 font-mono text-xl font-semibold">
							{formatUsd(roast.cost.monthlyProjectionUsd)}
						</dd>
						<small className="mt-1.5 block text-[11px] text-muted">
							{roast.cost.projectionAssumption}
						</small>
					</div>
				</dl>
				{roast.cost.unpricedModels.length > 0 && (
					<p className="mt-3 text-xs leading-relaxed text-muted" role="note">
						Dollar totals exclude unpriced models:{" "}
						{roast.cost.unpricedModels.join(", ")}.
					</p>
				)}
			</section>

			<details className="border-t border-line opacity-0 animate-enter [animation-delay:200ms]">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 [&::-webkit-details-marker]:hidden">
					<span className="text-xl font-semibold tracking-[-0.02em]">
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
									<small className="block font-mono text-[10px] text-muted">
										{span.type}
									</small>
									<strong className="block truncate text-sm font-medium">
										{span.name}
									</strong>
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

			<aside className="border-t border-line pt-6 text-center font-serif text-base italic text-muted opacity-0 animate-enter [animation-delay:240ms]">
				“{line}”
			</aside>
		</article>
	);
}

function ActionRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 sm:grid-cols-[94px_minmax(0,1fr)] sm:gap-3.5">
			<dt className={`${monoLabel} text-muted`}>{label}</dt>
			<dd className="text-sm leading-relaxed">{value}</dd>
		</div>
	);
}

function ReportCostCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-r border-b border-line p-4.5">
			<dt className={`${monoLabel} text-muted`}>{label}</dt>
			<dd className="mt-2 font-mono text-xl font-semibold">{value}</dd>
		</div>
	);
}
