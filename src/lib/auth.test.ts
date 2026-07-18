import { describe, expect, it } from "vitest";
import {
	getConfirmationError,
	getEmailError,
	getPasswordError,
	validateCodeInput,
	validateCredentials,
	validateEmailInput,
	validatePasswordInput,
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

	it("validates every auth payload at the server boundary", () => {
		expect(getEmailError("user@example.com")).toBeNull();
		expect(getEmailError(`${"a".repeat(310)}@example.com`)).toBe(
			"Enter a valid email address.",
		);
		expect(getPasswordError("short")).toBe(
			"Password must be at least 8 characters.",
		);
		expect(getPasswordError("x".repeat(129))).toBe(
			"Password must be 128 characters or fewer.",
		);
		expect(getPasswordError("password")).toBeNull();
		expect(getConfirmationError("password", "password")).toBeNull();

		expect(validateEmailInput({ email: " user@example.com " })).toEqual({
			email: "user@example.com",
		});
		expect(validatePasswordInput({ password: "password" })).toEqual({
			password: "password",
		});
		expect(validateCodeInput({ code: "recovery-code" })).toEqual({
			code: "recovery-code",
		});
		expect(() => validateEmailInput({ email: "bad" })).toThrow(
			"Enter a valid email address.",
		);
		expect(() => validatePasswordInput({ password: "short" })).toThrow(
			"Password must be at least 8 characters.",
		);
		expect(() => validateCredentials(null)).toThrow("Invalid request.");
		expect(() =>
			validateCredentials({ email: 42, password: "password" }),
		).toThrow("Invalid request.");
		expect(() => validateCodeInput({ code: "x".repeat(2049) })).toThrow(
			"Invalid recovery link.",
		);
	});
});
