import { useState } from "react";
import { logOut } from "#/lib/auth.functions";

export function SignOutButton() {
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSignOut() {
		setPending(true);
		setError(null);
		try {
			const result = await logOut();
			if (!result.ok) {
				setError(result.error);
				return;
			}
			window.location.assign("/login");
		} catch {
			setError("Could not sign out. Try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div>
			<button
				className="rounded-full border border-[var(--border,#e7e5e4)] px-4 py-2 text-sm"
				disabled={pending}
				onClick={handleSignOut}
				type="button"
			>
				{pending ? "Signing out…" : "Sign out"}
			</button>
			{error ? (
				<p className="mt-1 text-sm text-[var(--ember,#ff4d00)]" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
