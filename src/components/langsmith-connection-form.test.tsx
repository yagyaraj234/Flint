// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { afterEach, describe, expect, it, mock } from "bun:test";
// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM } from "jsdom";

if (typeof document === "undefined") {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://flint.test/app/integrations/langsmith/new",
	});
	for (const key of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Node",
		"Event",
		"MouseEvent",
		"MutationObserver",
	] as const) {
		Object.defineProperty(globalThis, key, {
			configurable: true,
			value: dom.window[key],
		});
	}
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	value: true,
	writable: true,
});

const validateLangSmithKey = mock(() =>
	Promise.resolve({ workspaces: [{ id: "workspace-1", name: "Production" }] }),
);
const discoverLangSmithProjects = mock(() =>
	Promise.resolve({ projects: [{ name: "support-agent" }] }),
);
const createLangSmithConnection = mock();
const deleteLangSmithConnection = mock();
const getLangSmithConnections = mock(() => Promise.resolve([]));
const reconnectLangSmithConnection = mock(() =>
	Promise.resolve({
		id: "connection-1",
		label: "Production",
		endpoint: "https://api.smith.langchain.com",
		workspace_id: "workspace-1",
		project_name: "support-agent",
		status: "active",
		last_sync_finished_at: null,
		last_success_at: null,
		last_scan_count: 0,
		last_error: null,
	}),
);
const syncLangSmithConnection = mock();
const updateLangSmithStatus = mock();

mock.module("#/lib/langsmith.functions", () => ({
	createLangSmithConnection,
	deleteLangSmithConnection,
	discoverLangSmithProjects,
	getLangSmithConnections,
	reconnectLangSmithConnection,
	syncLangSmithConnection,
	updateLangSmithStatus,
	validateLangSmithKey,
}));

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { LangSmithConnectionForm } = await import("./langsmith-connection-form");
const { LangSmithConnectionCard } = await import("./langsmith-connection-card");

afterEach(() => {
	cleanup();
	validateLangSmithKey.mockClear();
	discoverLangSmithProjects.mockClear();
	createLangSmithConnection.mockClear();
	deleteLangSmithConnection.mockClear();
	reconnectLangSmithConnection.mockClear();
	syncLangSmithConnection.mockClear();
	updateLangSmithStatus.mockClear();
});

describe("LangSmithConnectionForm", () => {
	it("requires a fresh key validation before connection", async () => {
		render(<LangSmithConnectionForm onConnected={mock()} />);
		fireEvent.change(screen.getByLabelText("Connection label"), {
			target: { value: "Production" },
		});
		fireEvent.change(screen.getByLabelText("LangSmith API key"), {
			target: { value: "lsv2_test" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Validate key" }));

		await waitFor(() =>
			expect(screen.getByLabelText("Workspace")).toBeTruthy(),
		);
		fireEvent.change(screen.getByLabelText("Workspace"), {
			target: { value: "workspace-1" },
		});
		await waitFor(() => expect(screen.getByLabelText("Project")).toBeTruthy());
		fireEvent.change(screen.getByLabelText("Project"), {
			target: { value: "support-agent" },
		});
		expect(
			screen.getByRole<HTMLButtonElement>("button", {
				name: "Connect LangSmith",
			}).disabled,
		).toBe(false);

		fireEvent.change(screen.getByLabelText("LangSmith API key"), {
			target: { value: "lsv2_replaced" },
		});
		expect(
			screen.getByRole<HTMLButtonElement>("button", {
				name: "Connect LangSmith",
			}).disabled,
		).toBe(true);
		expect(screen.queryByLabelText("Workspace")).toBeNull();
	});

	it("keeps stored credentials out of cards and reconnects through a server function", async () => {
		render(
			<LangSmithConnectionCard
				connection={{
					id: "connection-1",
					label: "Production",
					endpoint: "https://api.smith.langchain.com",
					workspace_id: "workspace-1",
					project_name: "support-agent",
					status: "invalid",
					last_sync_finished_at: null,
					last_success_at: null,
					last_scan_count: 0,
					last_error: "invalid_key",
				}}
				onChanged={mock()}
				onDeleted={mock()}
			/>,
		);
		expect(screen.queryByDisplayValue(/lsv2_/)).toBeNull();
		fireEvent.change(screen.getByLabelText("Replacement LangSmith API key"), {
			target: { value: "lsv2_replacement" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
		await waitFor(() =>
			expect(reconnectLangSmithConnection).toHaveBeenCalledWith({
				data: { id: "connection-1", api_key: "lsv2_replacement" },
			}),
		);
	});
});
