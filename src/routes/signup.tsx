import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthField, authButtonClass } from "#/components/auth-form";
import { AuthShell } from "#/components/auth-shell";
import {
	getConfirmationError,
	getEmailError,
	getPasswordError,
} from "#/lib/auth";
import { signUp } from "#/lib/auth.functions";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [errors, setErrors] = useState<{
		confirmation?: string | null;
		email?: string | null;
		form?: string;
		password?: string | null;
	}>({});
	const [pending, setPending] = useState(false);
	const [confirmationSent, setConfirmationSent] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors = {
			confirmation: getConfirmationError(password, confirmation),
			email: getEmailError(email),
			password: getPasswordError(password),
		};
		setErrors(nextErrors);
		if (nextErrors.email || nextErrors.password || nextErrors.confirmation)
			return;

		setPending(true);
		try {
			const result = await signUp({ data: { email, password } });
			if (!result.ok) {
				setErrors({ form: result.error });
				return;
			}
			if (result.needsEmailConfirmation) {
				setConfirmationSent(true);
				return;
			}
			window.location.assign("/app");
		} catch {
			setErrors({ form: "Could not create account. Try again." });
		} finally {
			setPending(false);
		}
	}

	if (confirmationSent) {
		return (
			<AuthShell title="Check your email">
				<p className="mb-6 text-sm text-[var(--muted,#78716c)]">
					Open the confirmation link, then log in.
				</p>
				<Link className="text-[var(--ember,#ff4d00)]" to="/login">
					Back to login
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell title="Start roasting">
			<p className="text-sm text-[var(--muted,#78716c)]">
				Create an account to roast your first trace.
			</p>
			<form className="mt-6 space-y-5" onSubmit={handleSubmit}>
				<AuthField
					autoComplete="email"
					error={errors.email}
					id="email"
					label="Email"
					maxLength={320}
					onChange={setEmail}
					type="email"
					value={email}
				/>
				<AuthField
					autoComplete="new-password"
					error={errors.password}
					id="password"
					label="Password"
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
					{pending ? "Creating account…" : "Start roasting"}
				</button>
			</form>
			<p className="mt-6 text-center text-sm text-[var(--muted,#78716c)]">
				Already have an account?{" "}
				<Link className="text-[var(--ember,#ff4d00)]" to="/login">
					Log in
				</Link>
			</p>
		</AuthShell>
	);
}
