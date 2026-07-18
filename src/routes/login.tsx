import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthField, authButtonClass } from "#/components/auth-form";
import { AuthShell } from "#/components/auth-shell";
import { getEmailError, getPasswordError } from "#/lib/auth";
import { logIn } from "#/lib/auth.functions";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errors, setErrors] = useState<{
		email?: string | null;
		form?: string;
		password?: string | null;
	}>({});
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors = {
			email: getEmailError(email),
			password: getPasswordError(password),
		};
		setErrors(nextErrors);
		if (nextErrors.email || nextErrors.password) return;

		setPending(true);
		try {
			const result = await logIn({ data: { email, password } });
			if (!result.ok) {
				setErrors({ form: result.error });
				return;
			}
			window.location.assign("/app");
		} catch {
			setErrors({ form: "Could not log in. Try again." });
		} finally {
			setPending(false);
		}
	}

	return (
		<AuthShell title="Welcome back">
			<p className="text-sm text-[var(--muted,#78716c)]">
				Your traces missed you.
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
				<div>
					<AuthField
						autoComplete="current-password"
						error={errors.password}
						id="password"
						label="Password"
						maxLength={128}
						minLength={8}
						onChange={setPassword}
						type="password"
						value={password}
					/>
					<Link
						className="mt-2 block text-right text-sm text-[var(--ember,#ff4d00)]"
						to="/reset-password"
					>
						Forgot password?
					</Link>
				</div>
				{errors.form ? (
					<p className="text-sm text-[var(--ember,#ff4d00)]" role="alert">
						{errors.form}
					</p>
				) : null}
				<button className={authButtonClass} disabled={pending} type="submit">
					{pending ? "Logging in…" : "Log in"}
				</button>
			</form>
			<p className="mt-6 text-center text-sm text-[var(--muted,#78716c)]">
				No account?{" "}
				<Link className="text-[var(--ember,#ff4d00)]" to="/signup">
					Sign up
				</Link>
			</p>
		</AuthShell>
	);
}
