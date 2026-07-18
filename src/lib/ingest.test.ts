import { describe, expect, test } from "vitest";

import {
	analyzeTrace,
	findingsFromRedactions,
	normalizeTrace,
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
});
