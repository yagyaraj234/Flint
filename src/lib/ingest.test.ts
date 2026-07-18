import { describe, expect, test } from "vitest";

import {
	analyzeTrace,
	detectSource,
	findingsFromRedactions,
	normalizeTrace,
	parseSource,
	parseTraceDataset,
	redactTrace,
} from "./ingest";

describe("trace ingest", () => {
	test("parses JSONL, caps batches, and never analyzes raw secrets", () => {
		expect(parseTraceDataset('{"spans":[]}')).toHaveLength(1);
		expect(parseTraceDataset('[{"spans":[]},{"spans":[]}]')).toHaveLength(2);
		const traces = parseTraceDataset(
			'{"spans":[{"type":"tool","input":"sk-FAKE000000000000000000000000"}]}\n{"spans":[]}',
		);
		expect(traces).toHaveLength(2);

		const redacted = redactTrace(traces[0]);
		const stored = JSON.stringify(redacted.trace);
		expect(stored).not.toContain("sk-FAKE");
		expect(stored).toContain("«REDACTED:openai-key»");

		const result = analyzeTrace(
			normalizeTrace(redacted.trace, "test-trace"),
			findingsFromRedactions(redacted.hits),
		);
		expect(
			result.findings.some((finding) => finding.rule === "leaked-secret"),
		).toBe(true);
		expect(result.tier).toBe("Well Done");
		expect(() =>
			parseTraceDataset(
				Array.from({ length: 21 }, (_, index) =>
					JSON.stringify({ index }),
				).join("\n"),
			),
		).toThrow("at most 20");
	});

	test("rejects empty, malformed, and non-object datasets", () => {
		expect(() => parseTraceDataset("  ")).toThrow(
			"Paste JSON or choose a trace file.",
		);
		expect(() => parseTraceDataset("[]")).toThrow(
			"Dataset contains no traces.",
		);
		expect(() => parseTraceDataset('{"ok":true}\nnot-json')).toThrow(
			"Invalid JSONL on line 2.",
		);
		expect(() => parseTraceDataset("[null]")).toThrow(
			"Trace 1 must be a JSON object.",
		);
		expect(() => parseTraceDataset("[[]]")).toThrow(
			"Trace 1 must be a JSON object.",
		);
	});

	test("redacts every supported secret recursively", () => {
		const secrets = [
			"sk-FAKE000000000000000000000000",
			"AKIA1234567890ABCDEF",
			"ghp_123456789012345678901234567890123456",
			"xoxb-1234567890-token",
			"AIza12345678901234567890123456789012345",
			"eyJheader.eyJpayload.signature",
			"-----BEGIN PRIVATE KEY-----",
			"Bearer 12345678901234567890",
		];
		const result = redactTrace({ nested: { values: [...secrets, null] } });
		expect(result.hits.map(({ rule }) => rule)).toEqual([
			"openai-key",
			"aws-key",
			"github-token",
			"slack-token",
			"google-key",
			"jwt",
			"private-key",
			"bearer",
		]);
		expect(JSON.stringify(result.trace)).not.toContain("AKIA");
	});

	test("normalizes nested SDK spans defensively", () => {
		const normalized = normalizeTrace(
			{
				data: {
					spans: [
						{
							span_id: "llm-1",
							parentId: "root",
							type: "generation",
							model: "gpt-test",
							prompt: { text: "hello" },
							response: { text: "world" },
							usage: { prompt_tokens: 3, completion_tokens: 4 },
							startMs: 10,
							durationMs: 20,
						},
						{ data: { type: "handoff", name: "delegate", args: ["x"] } },
						{ type: "guardrail", name: "safety" },
						{ type: "unknown" },
					],
				},
				workflow_name: "SDK workflow",
			},
			"fallback",
		);

		expect(normalized.traceId).toBe("fallback");
		expect(normalized.workflow).toBe("SDK workflow");
		expect(normalized.spans).toMatchObject([
			{
				id: "llm-1",
				parentId: "root",
				type: "llm",
				model: "gpt-test",
				tokensIn: 3,
				tokensOut: 4,
				tokenSource: "measured",
				startMs: 10,
				durationMs: 20,
			},
			{ type: "handoff", name: "delegate" },
			{ type: "guardrail", name: "safety" },
			{ id: "span-4", type: "other", name: "span 4" },
		]);
		expect(normalized.spans[0]?.input).toBe('{"text":"hello"}');
	});

	test("flags observable security, reliability, and cost failures", () => {
		const repeatedTools = Array.from({ length: 9 }, (_, index) => ({
			id: `tool-${index}`,
			parentId: null,
			type: "tool" as const,
			name: "fetch",
			model: null,
			startMs: null,
			durationMs: null,
			tokensIn: 1,
			tokensOut: 0,
			tokenSource: "estimated" as const,
			input: "email user@example.com via http://example.com",
			output: "",
			meta: {},
		}));
		const duplicateLlms = ["llm-1", "llm-2"].map((id, index) => ({
			id,
			parentId: null,
			type: "llm" as const,
			name: "gpt-test",
			model: "gpt-test",
			startMs: null,
			durationMs: null,
			tokensIn: 10,
			tokensOut: 2,
			tokenSource: index === 0 ? ("measured" as const) : ("estimated" as const),
			input: "same prompt",
			output: "ok",
			meta: index === 1 ? { status: "failed" } : {},
		}));
		const result = analyzeTrace(
			{
				traceId: "bad-trace",
				workflow: "Bad trace",
				spans: [...repeatedTools, ...duplicateLlms],
			},
			[
				{
					rule: "leaked-secret",
					category: "security",
					severity: 3,
					spanIds: [],
					message: "secret",
				},
			],
		);

		expect(result.findings.map(({ rule }) => rule)).toEqual(
			expect.arrayContaining([
				"pii-in-prompt",
				"insecure-url",
				"tool-loop",
				"duplicate-llm-call",
				"error-tail",
			]),
		);
		expect(
			result.findings.find(({ rule }) => rule === "tool-loop")?.severity,
		).toBe(3);
		expect(result.cost.tokenSource).toBe("mixed");
		expect(result.tier).toBe("Charcoal");
	});

	test("detects known dataset sources and safe fallbacks", () => {
		expect(detectSource({ source: "live" })).toBe("live");
		expect(detectSource({ dataset: "BFCL-v3" })).toBe("bfcl");
		expect(detectSource({ dataset: "gaia-dev" })).toBe("gaia");
		expect(detectSource({ dataset: "other" })).toBe("upload");
		expect(parseSource("synthetic", "upload")).toBe("synthetic");
		expect(parseSource("unknown", "gaia")).toBe("gaia");
		expect(
			analyzeTrace({ traceId: "empty", workflow: "Empty", spans: [] }, []),
		).toMatchObject({
			score: 100,
			tier: "Rare",
			cost: { tokenSource: "estimated" },
		});
	});
});
