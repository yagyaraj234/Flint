import { createServerClient } from "@supabase/ssr";
import {
	getCookies,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";

function getAuthConfig() {
	const url = process.env.SUPABASE_URL;
	const key =
		process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

	if (!url || !key) {
		throw new Error(
			"SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) must be set",
		);
	}

	return { key, url };
}

export function getSupabaseAuthClient() {
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
