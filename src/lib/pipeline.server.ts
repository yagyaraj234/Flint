import { randomUUID } from "node:crypto";

import { nanoid } from "nanoid";

import { db } from "./db.server";
import {
	analyzeTrace,
	detectSource,
	type Finding,
	findingsFromRedactions,
	normalizeTrace,
	redactTrace,
} from "./ingest";
import type { RoastSource } from "./roasts";

interface StageDatasetInput {
	traces: Array<Record<string, unknown>>;
	title?: string;
	source?: RoastSource;
	userId: string | null;
}

export async function stageDataset(input: StageDatasetInput) {
	const batchId = randomUUID();
	const rows = input.traces.map((trace, index) => {
		const slug = nanoid(8);
		const redacted = redactTrace(trace);
		const redactedTitle = input.title
			? redactTrace({ title: input.title })
			: { trace: {}, hits: [] };
		const title = traceTitle(
			redacted.trace,
			string(redactedTitle.trace.title) || undefined,
			index,
			input.traces.length,
		);
		return {
			slug,
			title,
			source: input.source ?? detectSource(trace),
			raw_trace: redacted.trace,
			normalized: { traceId: slug, workflow: title, spans: [] },
			findings: findingsFromRedactions([
				...redacted.hits,
				...redactedTitle.hits,
			]),
			cost: emptyCost(),
			score: 0,
			tier: "Processing",
			roast_line: null,
			status: "processing",
			error: null,
			user_id: input.userId,
			batch_id: batchId,
		};
	});

	const { error } = await db.from("roasts").insert(rows);
	if (error) throw new Error(`Could not stage traces: ${error.message}`);

	return {
		batchId,
		slugs: rows.map((row) => row.slug),
	};
}

export async function processPendingBatch(
	batchId: string,
	userId: string | null,
) {
	let query = db
		.from("roasts")
		.select("id, slug, raw_trace, findings")
		.eq("batch_id", batchId)
		.eq("status", "processing");
	query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
	const { data, error } = await query.order("created_at", { ascending: true });

	if (error) throw new Error(`Could not load batch: ${error.message}`);

	for (const value of (data ?? []) as unknown[]) {
		const row = record(value);
		const id = string(row.id);
		const slug = string(row.slug);
		if (!id || !slug) continue;

		try {
			const rawTrace = record(row.raw_trace);
			const findings = Array.isArray(row.findings)
				? (row.findings as Finding[])
				: [];
			const result = analyzeTrace(normalizeTrace(rawTrace, slug), findings);
			const { error: updateError } = await db
				.from("roasts")
				.update({
					normalized: result.normalized,
					findings: result.findings,
					cost: result.cost,
					score: result.score,
					tier: result.tier,
					status: "done",
					error: null,
				})
				.eq("id", id)
				.eq("status", "processing");
			if (updateError) throw new Error(updateError.message);
		} catch (processingError) {
			const message =
				processingError instanceof Error
					? processingError.message.slice(0, 240)
					: "Trace processing failed.";
			await db
				.from("roasts")
				.update({ status: "failed", error: message })
				.eq("id", id)
				.eq("status", "processing");
		}
	}
}

export async function ingestSingle(input: {
	trace: Record<string, unknown>;
	title?: string;
	source: RoastSource;
}) {
	const staged = await stageDataset({
		traces: [input.trace],
		title: input.title,
		source: input.source,
		userId: null,
	});
	await processPendingBatch(staged.batchId, null);
	const slug = staged.slugs[0];
	if (!slug) throw new Error("Trace was not staged.");
	return { slug };
}

function traceTitle(
	trace: Record<string, unknown>,
	requestedTitle: string | undefined,
	index: number,
	total: number,
) {
	const base =
		requestedTitle?.trim() ||
		string(
			trace.title ?? trace.workflow ?? trace.workflow_name ?? trace.name,
		) ||
		"Uploaded trace";
	return (total > 1 ? `${base} ${index + 1}` : base).slice(0, 120);
}

function emptyCost() {
	return {
		totalTokensIn: 0,
		totalTokensOut: 0,
		totalUsd: 0,
		wasteUsd: 0,
		tokenSource: "estimated",
		monthlyProjectionUsd: 0,
		projectionAssumption: "at 1,000 runs/day",
	};
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function string(value: unknown) {
	return typeof value === "string" ? value : "";
}
