import { describe, expect, it } from "vitest";
import {
	getConfirmationError,
	validateCodeInput,
	validateCredentials,
} from "./auth";

describe("auth input validation", () => {
	it("accepts valid credentials and rejects malformed auth input", () => {
		expect(
			validateCredentials({
				email: " user@example.com ",
				password: "password",
			}),
		).toEqual({ email: "user@example.com", password: "password" });
		expect(() =>
			validateCredentials({ email: "bad", password: "short" }),
		).toThrow("Enter a valid email address.");
		expect(getConfirmationError("password", "different")).toBe(
			"Passwords do not match.",
		);
		expect(() => validateCodeInput({ code: "" })).toThrow(
			"Invalid recovery link.",
		);
	});
});
