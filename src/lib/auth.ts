export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 320;
const MAX_CODE_LENGTH = 2048;

export interface Credentials {
	email: string;
	password: string;
}

export function getEmailError(email: string) {
	const value = email.trim();
	if (
		!value ||
		value.length > MAX_EMAIL_LENGTH ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
	) {
		return "Enter a valid email address.";
	}
	return null;
}

export function getPasswordError(password: string) {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
	}
	return null;
}

export function getConfirmationError(password: string, confirmation: string) {
	return password === confirmation ? null : "Passwords do not match.";
}

function readRecord(input: unknown) {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("Invalid request.");
	}
	return input as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string) {
	const value = record[key];
	if (typeof value !== "string") {
		throw new Error("Invalid request.");
	}
	return value;
}

export function validateCredentials(input: unknown): Credentials {
	const record = readRecord(input);
	const email = readString(record, "email").trim();
	const password = readString(record, "password");
	const error = getEmailError(email) ?? getPasswordError(password);
	if (error) throw new Error(error);
	return { email, password };
}

export function validateEmailInput(input: unknown) {
	const email = readString(readRecord(input), "email").trim();
	const error = getEmailError(email);
	if (error) throw new Error(error);
	return { email };
}

export function validatePasswordInput(input: unknown) {
	const password = readString(readRecord(input), "password");
	const error = getPasswordError(password);
	if (error) throw new Error(error);
	return { password };
}

export function validateCodeInput(input: unknown) {
	const code = readString(readRecord(input), "code");
	if (!code || code.length > MAX_CODE_LENGTH)
		throw new Error("Invalid recovery link.");
	return { code };
}
