import { describe, expect, test } from "vitest";

import {
	parseSharingPayload,
	validateShareInput,
	validateSharingSlug,
	validateVisibilityInput,
} from "./shares";

describe("sharing data", () => {
	test("validates mutation inputs", () => {
		expect(validateSharingSlug("report_123")).toBe("report_123");
		expect(
			validateVisibilityInput({ slug: "report_123", visibility: "private" }),
		).toEqual({ slug: "report_123", visibility: "private" });
		expect(
			validateShareInput({ slug: "report_123", email: " person@example.com " }),
		).toEqual({ slug: "report_123", email: "person@example.com" });
		expect(() =>
			validateShareInput({ slug: "report_123", email: "bad" }),
		).toThrow("valid email");
	});

	test("parses the frozen sharing response", () => {
		expect(
			parseSharingPayload({
				visibility: "public",
				shares: [
					{ email: "person@example.com", created_at: "2026-07-19T00:00:00Z" },
				],
			}),
		).toEqual({
			visibility: "public",
			shares: [
				{ email: "person@example.com", created_at: "2026-07-19T00:00:00Z" },
			],
		});
		expect(() =>
			parseSharingPayload({ visibility: "public", shares: [{}] }),
		).toThrow("invalid");
	});
});
