import { createServerClient } from "@supabase/ssr";
import {
	getCookies,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";

const missingAuthConfig =
	"SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) must be set";
const demoUserCookie = "helix_demo_user";
const demoRecoveryCookie = "helix_demo_recovery";

function isDemoMode() {
	return process.env.HELIX_DEMO === "true";
}

function demoEmail(value: string | undefined) {
	const email = value?.trim().toLowerCase() ?? "";
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function demoCookieOptions(maxAge?: number) {
	return {
		httpOnly: true,
		maxAge,
		path: "/",
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
	};
}

function setDemoCookie(name: string, email: string, maxAge?: number) {
	setCookie(name, email, demoCookieOptions(maxAge));
}

function clearDemoCookie(name: string) {
	setDemoCookie(name, "", 0);
}

function demoSession(email: string) {
	return { access_token: `demo:${encodeURIComponent(email)}` };
}

function createDemoAuthClient() {
	return {
		auth: {
			exchangeCodeForSession: async (code: string) => {
				const email = code ? demoEmail(getCookies()[demoRecoveryCookie]) : null;
				if (!email)
					return { error: { message: "Invalid or expired recovery link." } };
				setDemoCookie(demoUserCookie, email);
				clearDemoCookie(demoRecoveryCookie);
				return { error: null };
			},
			getSession: async () => {
				const email = demoEmail(getCookies()[demoUserCookie]);
				return { data: { session: email ? demoSession(email) : null } };
			},
			getUser: async () => {
				const email = demoEmail(getCookies()[demoUserCookie]);
				return {
					data: {
						user: email ? { email, id: demoSession(email).access_token } : null,
					},
				};
			},
			resetPasswordForEmail: async (email: string, _options?: unknown) => {
				const normalized = demoEmail(email);
				if (!normalized)
					return { error: { message: "Enter a valid email address." } };
				setDemoCookie(demoRecoveryCookie, normalized, 15 * 60);
				return { error: null };
			},
			signInWithPassword: async ({
				email,
			}: {
				email: string;
				password: string;
			}) => {
				const normalized = demoEmail(email);
				if (!normalized)
					return { error: { message: "Enter a valid email address." } };
				setDemoCookie(demoUserCookie, normalized);
				return { error: null };
			},
			signOut: async () => {
				clearDemoCookie(demoUserCookie);
				return { error: null };
			},
			signUp: async ({ email }: { email: string; password: string }) => {
				const normalized = demoEmail(email);
				if (!normalized)
					return {
						data: { session: null },
						error: { message: "Enter a valid email address." },
					};
				setDemoCookie(demoUserCookie, normalized);
				return { data: { session: demoSession(normalized) }, error: null };
			},
			updateUser: async (_attributes: { password: string }) => ({
				error: null,
			}),
		},
	};
}

function getAuthConfig() {
	const url = process.env.SUPABASE_URL;
	const key =
		process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

	if (!url || !key) throw new Error(missingAuthConfig);

	return { key, url };
}

export function getSupabaseAuthClient() {
	if (isDemoMode()) return createDemoAuthClient();
	const { key, url } = getAuthConfig();

	return createServerClient(url, key, {
		cookieOptions: {
			httpOnly: true,
			path: "/",
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
		},
		cookies: {
			getAll() {
				return Object.entries(getCookies()).map(([name, value]) => ({
					name,
					value,
				}));
			},
			setAll(cookies, headers) {
				for (const { name, options, value } of cookies) {
					setCookie(name, value, options);
				}
				for (const [name, value] of Object.entries(headers)) {
					setResponseHeader(name, value);
				}
			},
		},
	});
}

export async function getAuthenticatedUser() {
	setResponseHeader("Cache-Control", "private, no-store");
	setResponseHeader("Vary", "Cookie");
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser();
	return user ? { email: user.email ?? "", id: user.id } : null;
}

export async function requireAuthenticatedUser() {
	const user = await getAuthenticatedUser();
	if (!user) throw new Error("Unauthorized.");
	return user;
}

export async function getAccessToken(): Promise<string | null> {
	const {
		data: { session },
	} = await getSupabaseAuthClient().auth.getSession();
	return session?.access_token ?? null;
}

export async function requireAccessToken(): Promise<string> {
	const token = await getAccessToken();
	if (!token) throw new Error("Unauthorized.");
	return token;
}
