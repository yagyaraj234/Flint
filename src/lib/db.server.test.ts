// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { afterAll, describe, expect, it, mock } from "bun:test";

const originalUrl = process.env.SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = { from: mock() };
const createClient = mock(() => client);

mock.module("@supabase/supabase-js", () => ({ createClient }));

afterAll(() => {
	if (originalUrl === undefined) delete process.env.SUPABASE_URL;
	else process.env.SUPABASE_URL = originalUrl;
	if (originalServiceKey === undefined)
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
});

describe("database server client", () => {
	it("fails closed without secrets and disables persisted sessions", async () => {
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		// @ts-expect-error The query string deliberately creates an isolated module instance.
		await expect(import("./db.server.ts?missing-config")).rejects.toThrow(
			"SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
		);

		process.env.SUPABASE_URL = "https://example.supabase.co";
		process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
		// @ts-expect-error The query string deliberately creates an isolated module instance.
		const configured = await import("./db.server.ts?configured");
		expect(configured.db).toBe(client);
		expect(createClient).toHaveBeenCalledWith(
			"https://example.supabase.co",
			"service-role",
			{ auth: { persistSession: false } },
		);
	});
});
