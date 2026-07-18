export type SharingVisibility = "public" | "private";

export interface RoastShare {
	email: string;
	created_at: string;
}

export interface SharingPayload {
	visibility: SharingVisibility;
	shares: RoastShare[];
}

export interface VisibilityInput {
	slug: string;
	visibility: SharingVisibility;
}

export interface ShareInput {
	slug: string;
	email: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSharingSlug(value: unknown): string {
	if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
		throw new Error("Invalid report slug.");
	}
	return value;
}

function validateEmail(value: unknown): string {
	const email = typeof value === "string" ? value.trim() : "";
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error("Enter a valid email address.");
	}
	return email;
}

export function validateVisibilityInput(value: unknown): VisibilityInput {
	if (!isRecord(value)) throw new Error("Invalid sharing request.");
	if (value.visibility !== "public" && value.visibility !== "private") {
		throw new Error("Visibility must be public or private.");
	}
	return {
		slug: validateSharingSlug(value.slug),
		visibility: value.visibility,
	};
}

export function validateShareInput(value: unknown): ShareInput {
	if (!isRecord(value)) throw new Error("Invalid sharing request.");
	return {
		slug: validateSharingSlug(value.slug),
		email: validateEmail(value.email),
	};
}

export function parseSharingPayload(value: unknown): SharingPayload {
	if (
		!isRecord(value) ||
		(value.visibility !== "public" && value.visibility !== "private") ||
		!Array.isArray(value.shares)
	) {
		throw new Error("Sharing response was invalid.");
	}

	const shares = value.shares.map((share) => {
		if (
			!isRecord(share) ||
			typeof share.email !== "string" ||
			typeof share.created_at !== "string"
		) {
			throw new Error("Sharing response was invalid.");
		}
		return { email: share.email, created_at: share.created_at };
	});

	return { visibility: value.visibility, shares };
}
