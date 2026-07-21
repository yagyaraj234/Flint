import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthField, authButtonClass } from "#/components/auth-form";
import { AuthShell } from "#/components/auth-shell";
import { getEmailError } from "#/lib/auth";
import { requestPasswordReset } from "#/lib/auth.functions";

export const Route = createFileRoute("/reset-password")({
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const [email, setEmail] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);
	const [demo, setDemo] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const error = getEmailError(email);
		setEmailError(error);
		setFormError(null);
		if (error) return;

		setPending(true);
		try {
			const result = await requestPasswordReset({ data: { email } });
			if (!result.ok) {
				setFormError(result.error);
				return;
			}
			setDemo("demo" in result && result.demo);
			setSent(true);
		} catch {
			setFormError("Could not send reset email. Try again.");
		} finally {
			setPending(false);
		}
	}

	if (sent) {
		return (
			<AuthShell title="Check your email">
				<p className="mb-6 text-sm text-muted">
					{demo
						? "Demo mode does not send email. Continue with the local reset flow."
						: "Use the link we sent to choose a new password."}
				</p>
				{demo ? (
					<Link
						className="mb-4 block text-accent"
						to="/update-password"
						search={{ code: "demo" }}
					>
						Continue to password reset
					</Link>
				) : null}
				<Link className="text-accent" to="/login">
					Back to login
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell title="Reset password">
			<p className="text-sm text-muted">
				We’ll send you a secure password reset link.
			</p>
			<form className="mt-6 space-y-5" onSubmit={handleSubmit}>
				<AuthField
					autoComplete="email"
					error={emailError}
					id="email"
					label="Email"
					maxLength={320}
					onChange={setEmail}
					type="email"
					value={email}
				/>
				{formError ? (
					<p className="text-sm text-danger" role="alert">
						{formError}
					</p>
				) : null}
				<button className={authButtonClass} disabled={pending} type="submit">
					{pending ? "Sending…" : "Send reset link"}
				</button>
			</form>
			<p className="mt-6 text-center text-sm">
				<Link className="text-accent" to="/login">
					Back to login
				</Link>
			</p>
		</AuthShell>
	);
}
