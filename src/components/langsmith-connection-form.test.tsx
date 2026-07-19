// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { afterEach, describe, expect, it, mock } from "bun:test";
// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM } from "jsdom";

if (typeof document === "undefined") {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://helix.test/app/integrations/langsmith/new",
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
		sync_cron: "0 * * * *",
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
mock.restore();

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
		fireEvent.change(screen.getByLabelText("LangSmith endpoint"), {
			target: { value: "https://eu.api.smith.langchain.com" },
		});
		expect(screen.queryByLabelText("Workspace")).toBeNull();

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

	it("reports validation and project discovery failures", async () => {
		validateLangSmithKey.mockResolvedValueOnce({ workspaces: [] });
		render(<LangSmithConnectionForm onConnected={mock()} />);
		fireEvent.change(screen.getByLabelText("LangSmith API key"), {
			target: { value: "lsv2_empty" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Validate key" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"No workspaces are available",
			),
		);

		cleanup();
		validateLangSmithKey.mockRejectedValueOnce(new Error("bad key"));
		render(<LangSmithConnectionForm onConnected={mock()} />);
		fireEvent.change(screen.getByLabelText("LangSmith API key"), {
			target: { value: "lsv2_bad" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Validate key" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Key validation failed",
			),
		);

		cleanup();
		discoverLangSmithProjects.mockResolvedValueOnce({ projects: [] });
		render(<LangSmithConnectionForm onConnected={mock()} />);
		fireEvent.change(screen.getByLabelText("LangSmith API key"), {
			target: { value: "lsv2_empty_projects" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Validate key" }));
		await waitFor(() =>
			expect(screen.getByLabelText("Workspace")).toBeTruthy(),
		);
		fireEvent.change(screen.getByLabelText("Workspace"), {
			target: { value: "workspace-1" },
		});
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"No projects are available",
			),
		);

		cleanup();
		discoverLangSmithProjects.mockRejectedValueOnce(new Error("unavailable"));
		render(<LangSmithConnectionForm onConnected={mock()} />);
		fireEvent.change(screen.getByLabelText("LangSmith API key"), {
			target: { value: "lsv2_project_error" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Validate key" }));
		await waitFor(() =>
			expect(screen.getByLabelText("Workspace")).toBeTruthy(),
		);
		fireEvent.change(screen.getByLabelText("Workspace"), {
			target: { value: "workspace-1" },
		});
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Could not load projects",
			),
		);
	});

	it("creates a validated connection and reports save failures", async () => {
		const onConnected = mock();
		const fillAndValidate = async () => {
			fireEvent.change(screen.getByLabelText("Connection label"), {
				target: { value: "Production" },
			});
			fireEvent.change(screen.getByLabelText("LangSmith API key"), {
				target: { value: "lsv2_connect" },
			});
			fireEvent.click(screen.getByRole("button", { name: "Validate key" }));
			await waitFor(() =>
				expect(screen.getByLabelText("Workspace")).toBeTruthy(),
			);
			fireEvent.change(screen.getByLabelText("Workspace"), {
				target: { value: "workspace-1" },
			});
			await waitFor(() =>
				expect(screen.getByLabelText("Project")).toBeTruthy(),
			);
			fireEvent.change(screen.getByLabelText("Project"), {
				target: { value: "support-agent" },
			});
		};

		createLangSmithConnection.mockRejectedValueOnce(new Error("save failed"));
		render(<LangSmithConnectionForm onConnected={onConnected} />);
		await fillAndValidate();
		fireEvent.submit(
			screen.getByRole("form", { name: "LangSmith connection" }),
		);
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Could not save this LangSmith connection",
			),
		);

		cleanup();
		const connection = {
			id: "connection-1",
			label: "Production",
			endpoint: "https://api.smith.langchain.com",
			workspace_id: "workspace-1",
			project_name: "support-agent",
			status: "active" as const,
			sync_cron: "0 * * * *",
			last_sync_finished_at: null,
			last_success_at: null,
			last_scan_count: 0,
			last_error: null,
		};
		createLangSmithConnection.mockResolvedValueOnce(connection);
		render(<LangSmithConnectionForm onConnected={onConnected} />);
		await fillAndValidate();
		fireEvent.change(screen.getByLabelText("Sync schedule"), {
			target: { value: "custom" },
		});
		fireEvent.change(screen.getByLabelText("Custom cron (UTC)"), {
			target: { value: "0 9 * * 1-5" },
		});
		fireEvent.submit(
			screen.getByRole("form", { name: "LangSmith connection" }),
		);
		await waitFor(() =>
			expect(createLangSmithConnection).toHaveBeenCalledWith({
				data: {
					label: "Production",
					endpoint: "https://api.smith.langchain.com",
					api_key: "lsv2_connect",
					workspace_id: "workspace-1",
					project_name: "support-agent",
					sync_cron: "0 9 * * 1-5",
				},
			}),
		);
		await waitFor(() => expect(onConnected).toHaveBeenCalledWith(connection));
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
					sync_cron: "0 * * * *",
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

	it("shows an action error when a connection operation fails", async () => {
		syncLangSmithConnection.mockRejectedValueOnce(new Error("offline"));
		render(
			<LangSmithConnectionCard
				connection={{
					id: "connection-1",
					label: "Production",
					endpoint: "https://api.smith.langchain.com",
					workspace_id: "workspace-1",
					project_name: "support-agent",
					status: "active",
					sync_cron: "0 * * * *",
					last_sync_finished_at: null,
					last_success_at: null,
					last_scan_count: 0,
					last_error: null,
				}}
				onChanged={mock()}
				onDeleted={mock()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Scan now" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Connection action could not be completed",
			),
		);
	});

	it("updates, pauses, resumes, and removes active connections", async () => {
		const connection = {
			id: "connection-1",
			label: "Production",
			endpoint: "https://api.smith.langchain.com",
			workspace_id: "workspace-1",
			project_name: "support-agent",
			status: "active" as const,
			sync_cron: "0 * * * *",
			last_sync_finished_at: null,
			last_success_at: "2026-07-19T00:00:00Z",
			last_scan_count: 4,
			last_error: "rate_limited",
		};
		const onChanged = mock();
		const onDeleted = mock();
		syncLangSmithConnection.mockResolvedValue({ connection });
		updateLangSmithStatus.mockResolvedValue({
			...connection,
			status: "paused",
		});
		deleteLangSmithConnection.mockResolvedValue(undefined);
		const { rerender } = render(
			<LangSmithConnectionCard
				connection={connection}
				onChanged={onChanged}
				onDeleted={onDeleted}
			/>,
		);
		expect(screen.getByText(/LangSmith rate limited/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Scan now" }));
		await waitFor(() => expect(onChanged).toHaveBeenCalledWith(connection));
		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		await waitFor(() =>
			expect(updateLangSmithStatus).toHaveBeenCalledWith({
				data: { id: "connection-1", status: "paused" },
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
		await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("connection-1"));

		rerender(
			<LangSmithConnectionCard
				connection={{ ...connection, status: "paused", last_error: "unknown" }}
				onChanged={onChanged}
				onDeleted={onDeleted}
			/>,
		);
		expect(screen.getByText(/Last scan did not complete/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Resume" }));
		await waitFor(() =>
			expect(updateLangSmithStatus).toHaveBeenCalledWith({
				data: { id: "connection-1", status: "active" },
			}),
		);
	});
});
