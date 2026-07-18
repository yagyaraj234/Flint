import { describe, expect, test } from "vitest";

import { detectSource, parseSource, parseTraceDataset } from "./ingest";

describe("trace ingest parsing", () => {
	test("parses JSON, JSONL, and enforces the batch limit", () => {
		expect(parseTraceDataset('{"spans":[]}')).toHaveLength(1);
		expect(parseTraceDataset('[{"spans":[]},{"spans":[]}]')).toHaveLength(2);
		expect(parseTraceDataset('{"spans":[]}\n{"spans":[]}')).toHaveLength(2);
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
	});

	test("detects known dataset sources and safe fallbacks", () => {
		expect(detectSource({ source: "live" })).toBe("live");
		expect(detectSource({ dataset: "BFCL-v3" })).toBe("bfcl");
		expect(detectSource({ dataset: "gaia-dev" })).toBe("gaia");
		expect(detectSource({ dataset: "other" })).toBe("upload");
		expect(parseSource("synthetic", "upload")).toBe("synthetic");
		expect(parseSource("unknown", "gaia")).toBe("gaia");
	});
});
