import type { RoastSource } from "./roasts";

const SOURCES = new Set<RoastSource>([
	"synthetic",
	"upload",
	"bfcl",
	"gaia",
	"live",
]);

export function parseTraceDataset(
	text: string,
): Array<Record<string, unknown>> {
	const input = text.trim();
	if (!input) throw new Error("Paste JSON or choose a trace file.");

	let traces: unknown[];
	try {
		const parsed: unknown = JSON.parse(input);
		traces = Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		traces = input
			.split(/\r?\n/)
			.filter((line) => line.trim())
			.map((line, index) => {
				try {
					return JSON.parse(line) as unknown;
				} catch {
					throw new Error(`Invalid JSONL on line ${index + 1}.`);
				}
			});
	}

	if (traces.length === 0) throw new Error("Dataset contains no traces.");
	if (traces.length > 20) throw new Error("Upload at most 20 traces at once.");

	return traces.map((trace, index) => {
		if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
			throw new Error(`Trace ${index + 1} must be a JSON object.`);
		}
		return trace as Record<string, unknown>;
	});
}

export function detectSource(trace: Record<string, unknown>): RoastSource {
	if (
		typeof trace.source === "string" &&
		SOURCES.has(trace.source as RoastSource)
	) {
		return trace.source as RoastSource;
	}
	const dataset = typeof trace.dataset === "string" ? trace.dataset : "";
	if (dataset.toLowerCase().includes("bfcl")) return "bfcl";
	if (dataset.toLowerCase().includes("gaia")) return "gaia";
	return "upload";
}

export function parseSource(
	value: unknown,
	fallback: RoastSource,
): RoastSource {
	return typeof value === "string" && SOURCES.has(value as RoastSource)
		? (value as RoastSource)
		: fallback;
}
