import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl, setResponseHeader } from "@tanstack/react-start/server";
import {
	validateCodeInput,
	validateCredentials,
	validateEmailInput,
	validatePasswordInput,
} from "./auth";
import { getSupabaseAuthClient } from "./supabase-auth.server";

export const signUp = createServerFn({ method: "POST" })
	.validator(validateCredentials)
	.handler(async ({ data }) => {
		const { data: authData, error } =
			await getSupabaseAuthClient().auth.signUp(data);
		if (error) return { error: error.message, ok: false as const };
		return {
			needsEmailConfirmation: !authData.session,
			ok: true as const,
		};
	});

export const logIn = createServerFn({ method: "POST" })
	.validator(validateCredentials)
	.handler(async ({ data }) => {
		const { error } =
			await getSupabaseAuthClient().auth.signInWithPassword(data);
		if (error) return { error: error.message, ok: false as const };
		return { ok: true as const };
	});

export const requestPasswordReset = createServerFn({ method: "POST" })
	.validator(validateEmailInput)
	.handler(async ({ data }) => {
		const redirectTo = new URL("/update-password", getRequestUrl()).toString();
		const { error } = await getSupabaseAuthClient().auth.resetPasswordForEmail(
			data.email,
			{ redirectTo },
		);
		if (error) return { error: error.message, ok: false as const };
		return { ok: true as const };
	});

export const exchangePasswordRecoveryCode = createServerFn({ method: "POST" })
	.validator(validateCodeInput)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseAuthClient().auth.exchangeCodeForSession(
			data.code,
		);
		if (error) return { error: error.message, ok: false as const };
		return { ok: true as const };
	});

export const updatePassword = createServerFn({ method: "POST" })
	.validator(validatePasswordInput)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseAuthClient().auth.updateUser({
			password: data.password,
		});
		if (error) return { error: error.message, ok: false as const };
		return { ok: true as const };
	});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
	async () => {
		setResponseHeader("Cache-Control", "private, no-store");
		setResponseHeader("Vary", "Cookie");
		const {
			data: { user },
		} = await getSupabaseAuthClient().auth.getUser();
		return user ? { email: user.email ?? "", id: user.id } : null;
	},
);

export const logOut = createServerFn({ method: "POST" }).handler(async () => {
	const { error } = await getSupabaseAuthClient().auth.signOut();
	if (error) return { error: error.message, ok: false as const };
	return { ok: true as const };
});
