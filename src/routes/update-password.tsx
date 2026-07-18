import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthField, authButtonClass } from "#/components/auth-form";
import { AuthShell } from "#/components/auth-shell";
import { getConfirmationError, getPasswordError } from "#/lib/auth";
import {
	exchangePasswordRecoveryCode,
	updatePassword,
} from "#/lib/auth.functions";

export const Route = createFileRoute("/update-password")({
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code : undefined,
	}),
	beforeLoad: async ({ search }) => {
		if (!search.code) return { recoveryError: null };
		let result: Awaited<ReturnType<typeof exchangePasswordRecoveryCode>>;
		try {
			result = await exchangePasswordRecoveryCode({
				data: { code: search.code },
			});
		} catch {
			return { recoveryError: "Invalid or expired recovery link." };
		}
		if (!result.ok) return { recoveryError: result.error };
		throw redirect({
			replace: true,
			search: { code: undefined },
			to: "/update-password",
		});
	},
	component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
	const { recoveryError } = Route.useRouteContext();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [errors, setErrors] = useState<{
		confirmation?: string | null;
		form?: string;
		password?: string | null;
	}>({ form: recoveryError ?? undefined });
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors = {
			confirmation: getConfirmationError(password, confirmation),
			password: getPasswordError(password),
		};
		setErrors(nextErrors);
		if (nextErrors.password || nextErrors.confirmation) return;

		setPending(true);
		try {
			const result = await updatePassword({ data: { password } });
			if (!result.ok) {
				setErrors({ form: result.error });
				return;
			}
			window.location.assign("/app");
		} catch {
			setErrors({
				form: "Could not update password. Request a new reset link.",
			});
		} finally {
			setPending(false);
		}
	}

	return (
		<AuthShell title="Choose a new password">
			<p className="text-sm text-[var(--muted,#78716c)]">
				Choose a new password for your account.
			</p>
			<form className="mt-6 space-y-5" onSubmit={handleSubmit}>
				<AuthField
					autoComplete="new-password"
					error={errors.password}
					id="password"
					label="New password"
					maxLength={128}
					minLength={8}
					onChange={setPassword}
					type="password"
					value={password}
				/>
				<AuthField
					autoComplete="new-password"
					error={errors.confirmation}
					id="confirm-password"
					label="Confirm password"
					maxLength={128}
					minLength={8}
					onChange={setConfirmation}
					type="password"
					value={confirmation}
				/>
				{errors.form ? (
					<p className="text-sm text-[var(--ember,#ff4d00)]" role="alert">
						{errors.form}
					</p>
				) : null}
				<button className={authButtonClass} disabled={pending} type="submit">
					{pending ? "Updating…" : "Update password"}
				</button>
			</form>
		</AuthShell>
	);
}
