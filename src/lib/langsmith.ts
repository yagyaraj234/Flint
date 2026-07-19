export type LangSmithConnectionStatus =
	| "active"
	| "paused"
	| "invalid"
	| "disconnected";

export interface LangSmithConnection {
	id: string;
	label: string;
	endpoint: string;
	workspace_id: string;
	project_name: string;
	status: LangSmithConnectionStatus;
	sync_cron: string;
	last_sync_finished_at: string | null;
	last_success_at: string | null;
	last_scan_count: number;
	last_error: string | null;
}

export interface Workspace {
	id: string;
	name: string;
}

export interface Project {
	name: string;
}

export interface LangSmithConnectionInput {
	label: string;
	endpoint: string;
	api_key: string;
	workspace_id: string;
	project_name: string;
	sync_cron: string;
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Invalid request.");
	}
	return value as Record<string, unknown>;
}

function string(value: unknown, message: string, max = 500): string {
	if (typeof value !== "string" || !value.trim() || value.length > max) {
		throw new Error(message);
	}
	return value.trim();
}

function endpoint(value: unknown): string {
	const result = string(value, "Enter a valid LangSmith endpoint.");
	try {
		const url = new URL(result);
		const host = url.hostname.toLowerCase();
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.port ||
			url.pathname !== "/" ||
			url.search ||
			url.hash ||
			(host !== "smith.langchain.com" && !host.endsWith(".smith.langchain.com"))
		) {
			throw new Error();
		}
		return result.replace(/\/$/, "");
	} catch {
		throw new Error("Enter a valid LangSmith HTTPS endpoint.");
	}
}

export function validateConnectionInput(
	input: unknown,
): LangSmithConnectionInput {
	const value = record(input);
	return {
		label: string(value.label, "Enter a connection label.", 120),
		endpoint: endpoint(value.endpoint),
		api_key: string(value.api_key, "Enter a LangSmith API key.", 1000),
		workspace_id: string(value.workspace_id, "Choose a workspace.", 200),
		project_name: string(value.project_name, "Choose a project.", 200),
		sync_cron: string(value.sync_cron, "Choose a sync schedule.", 100).replace(
			/\s+/g,
			" ",
		),
	};
}

export function validateKeyInput(input: unknown) {
	const value = record(input);
	return {
		endpoint: endpoint(value.endpoint),
		api_key: string(value.api_key, "Enter a LangSmith API key.", 1000),
	};
}

export function validateDiscoverInput(input: unknown) {
	return {
		...validateKeyInput(input),
		workspace_id: string(
			record(input).workspace_id,
			"Choose a workspace.",
			200,
		),
	};
}

export function validateConnectionId(input: unknown) {
	return string(input, "Invalid connection.", 200);
}

export function validateStatusUpdate(input: unknown) {
	const value = record(input);
	const id = validateConnectionId(value.id);
	if (value.status !== "active" && value.status !== "paused") {
		throw new Error("Invalid connection status.");
	}
	return { id, status: value.status } as const;
}

export function validateReconnectInput(input: unknown) {
	const value = record(input);
	return {
		id: validateConnectionId(value.id),
		api_key: string(value.api_key, "Enter a LangSmith API key.", 1000),
	};
}

export function formatSyncTime(value: string | null): string {
	if (!value) return "Not scanned yet";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Not scanned yet"
		: new Intl.DateTimeFormat("en", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
}

export function formatSyncSchedule(value: string): string {
	return (
		{
			"*/30 * * * *": "Every 30 minutes",
			"0 * * * *": "Every hour",
			"0 */12 * * *": "Every 12 hours",
			"0 0 * * *": "Every 24 hours",
		}[value] ?? `Custom: ${value}`
	);
}
