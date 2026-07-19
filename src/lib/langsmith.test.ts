// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { describe, expect, it } from "bun:test";

import {
	formatSyncTime,
	validateConnectionId,
	validateConnectionInput,
	validateDiscoverInput,
	validateKeyInput,
	validateReconnectInput,
	validateStatusUpdate,
} from "./langsmith";

describe("LangSmith server-function validation", () => {
	it("allows LangSmith regional endpoints and rejects arbitrary HTTPS hosts", () => {
		expect(
			validateKeyInput({
				endpoint: "https://eu.api.smith.langchain.com/",
				api_key: "lsv2_test",
			}),
		).toEqual({
			endpoint: "https://eu.api.smith.langchain.com",
			api_key: "lsv2_test",
		});
		expect(() =>
			validateDiscoverInput({
				endpoint: "https://example.com",
				api_key: "lsv2_test",
				workspace_id: "workspace-1",
			}),
		).toThrow("LangSmith HTTPS endpoint");
	});

	it("validates every connection mutation and rejects malformed input", () => {
		const connection = {
			label: " Production ",
			endpoint: "https://api.smith.langchain.com/",
			api_key: " key ",
			workspace_id: " workspace ",
			project_name: " project ",
			sync_cron: " 0 * * * * ",
		};
		expect(validateConnectionInput(connection)).toEqual({
			...connection,
			label: "Production",
			endpoint: "https://api.smith.langchain.com",
			api_key: "key",
			workspace_id: "workspace",
			project_name: "project",
			sync_cron: "0 * * * *",
		});
		expect(validateStatusUpdate({ id: "one", status: "paused" })).toEqual({
			id: "one",
			status: "paused",
		});
		expect(validateReconnectInput({ id: "one", api_key: "key" })).toEqual({
			id: "one",
			api_key: "key",
		});
		expect(validateConnectionId(" one ")).toBe("one");
		for (const value of [
			null,
			{},
			{ ...connection, endpoint: "http://smith.langchain.com" },
			{ ...connection, endpoint: "https://user@smith.langchain.com" },
			{ ...connection, endpoint: "https://smith.langchain.com/path" },
			{ id: "one", status: "invalid" },
		]) {
			expect(() => {
				if ("status" in (value ?? {})) return validateStatusUpdate(value);
				return validateConnectionInput(value);
			}).toThrow();
		}
	});

	it("formats only valid scan timestamps", () => {
		expect(formatSyncTime(null)).toBe("Not scanned yet");
		expect(formatSyncTime("invalid")).toBe("Not scanned yet");
		expect(formatSyncTime("2026-07-19T00:00:00Z")).not.toBe("Not scanned yet");
	});
});
