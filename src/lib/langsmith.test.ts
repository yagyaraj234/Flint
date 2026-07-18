// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { describe, expect, it } from "bun:test";

import { validateDiscoverInput, validateKeyInput } from "./langsmith";

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
});
