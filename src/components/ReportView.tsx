import {
	fallbackRoastLine,
	type PublicFinding,
	type PublicFindingCategory,
	type PublicRoast,
} from "../lib/public-roasts";
import { ShareButtons } from "./ShareButtons";
import { ShareDialog } from "./ShareDialog";

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

function severityLabel(severity: PublicFinding["severity"]): string {
	if (severity === 3) return "High";
	if (severity === 2) return "Medium";
	return "Low";
}

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

	return (
		<article className="report-view">
			<header className="report-view__header">
				<div>
					<p className="mono-label">Trace report</p>
					<h1>{roast.title}</h1>
					<p className="report-view__meta mono-label">
						{roast.source} · {formatDate(roast.createdAt)} · {roast.traceId}
					</p>
					<ShareButtons roast={roast} />
					<ShareDialog slug={roast.slug} isOwner={roast.isOwner} />
				</div>
				<div className="report-score" data-grade={scoreGrade(roast.score)}>
					<strong>{roast.score}</strong>
					<span>/ 100 · {roast.tier}</span>
				</div>
			</header>

			<section
				className="report-view__section report-view__section--summary"
				aria-labelledby="report-summary-heading"
			>
				<p className="mono-label">Executive summary</p>
				<h2 id="report-summary-heading">Assessment</h2>
				<p className="report-view__lede">{roast.detailedReport.summary}</p>
				{!roast.detailedReport.generated && (
					<p className="report-view__fallback">
						Generated assessment unavailable. This summary uses deterministic
						trace findings.
					</p>
				)}
			</section>

			<section
				className="report-view__section report-view__section--findings"
				aria-labelledby="report-findings-heading"
			>
				<p className="mono-label">Evidence</p>
				<h2 id="report-findings-heading">Findings</h2>
				{findingGroups.length > 0 ? (
					<div className="report-findings">
						{findingGroups.map(({ category, findings }) => (
							<section key={category} aria-labelledby={`category-${category}`}>
								<h3 id={`category-${category}`}>{category}</h3>
								<ul>
									{findings.map((finding) => (
										<li
											key={`${finding.rule}-${finding.message}-${finding.severity}`}
										>
											<div className="report-finding__meta">
												<span data-severity={severityLabel(finding.severity)}>
													{severityLabel(finding.severity)}
												</span>
												<code>{finding.rule}</code>
											</div>
											<p>{finding.message}</p>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				) : (
					<p className="report-view__empty">
						No material findings in this trace.
					</p>
				)}
			</section>

			<section
				className="report-view__section report-view__section--actions"
				aria-labelledby="report-actions-heading"
			>
				<p className="mono-label">Remediation</p>
				<h2 id="report-actions-heading">Recommended actions</h2>
				{roast.detailedReport.actions.length > 0 ? (
					<div className="report-actions">
						{roast.detailedReport.actions.map((action) => (
							<dl key={`${action.rule}-${action.issue}-${action.fix}`}>
								<div>
									<dt>Issue</dt>
									<dd>{action.issue}</dd>
								</div>
								<div>
									<dt>Impact</dt>
									<dd>{action.impact}</dd>
								</div>
								<div>
									<dt>Fix</dt>
									<dd>{action.fix}</dd>
								</div>
								<div>
									<dt>Verification</dt>
									<dd>{action.verification}</dd>
								</div>
								<code>{action.rule}</code>
							</dl>
						))}
					</div>
				) : (
					<p className="report-view__empty">No remediation actions required.</p>
				)}
			</section>

			<section
				className="report-view__section report-view__section--cost"
				aria-labelledby="report-cost-heading"
			>
				<p className="mono-label">
					Usage and waste · {roast.cost.tokenSource} usage
				</p>
				<h2 id="report-cost-heading">Cost</h2>
				<dl className="report-costs">
					<div>
						<dt>Tokens in</dt>
						<dd>{formatNumber(roast.cost.totalTokensIn)}</dd>
					</div>
					<div>
						<dt>Tokens out</dt>
						<dd>{formatNumber(roast.cost.totalTokensOut)}</dd>
					</div>
					<div>
						<dt>Total cost</dt>
						<dd>{formatUsd(roast.cost.totalUsd)}</dd>
					</div>
					<div>
						<dt>Estimated waste</dt>
						<dd>{formatUsd(roast.cost.wasteUsd)}</dd>
					</div>
					<div className="report-costs__projection">
						<dt>Monthly projection</dt>
						<dd>{formatUsd(roast.cost.monthlyProjectionUsd)}</dd>
						<small>{roast.cost.projectionAssumption}</small>
					</div>
				</dl>
				{roast.cost.unpricedModels.length > 0 && (
					<p className="report-costs__caveat" role="note">
						Dollar totals exclude unpriced models:{" "}
						{roast.cost.unpricedModels.join(", ")}.
					</p>
				)}
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
									<small>{span.type}</small>
									<strong>{span.name}</strong>
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

			<aside className="report-view__roast">“{line}”</aside>
		</article>
	);
}
