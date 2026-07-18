import { type FormEvent, useEffect, useRef, useState } from "react";
import type { SharingPayload, SharingVisibility } from "../lib/shares";
import {
	addRoastShare,
	getRoastSharing,
	removeRoastShare,
	updateRoastVisibility,
} from "../lib/shares.functions";

function errorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Sharing request could not be completed.";
}

export function ShareDialog({
	slug,
	isOwner,
}: {
	slug: string;
	isOwner: boolean;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [sharing, setSharing] = useState<SharingPayload | null>(null);
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const [copied, setCopied] = useState(false);
	const [closing, setClosing] = useState(false);
	const [reportUrl, setReportUrl] = useState("");

	useEffect(
		() => () => {
			clearTimeout(closeTimer.current);
			clearTimeout(copyTimer.current);
		},
		[],
	);

	if (!isOwner) return null;

	async function apply(
		action: () => Promise<SharingPayload>,
	): Promise<boolean> {
		setError("");
		setPending(true);
		try {
			setSharing(await action());
			return true;
		} catch (actionError) {
			setError(errorMessage(actionError));
			return false;
		} finally {
			setPending(false);
		}
	}

	async function openDialog(): Promise<void> {
		setClosing(false);
		setSharing(null);
		setReportUrl(window.location.href);
		dialogRef.current?.showModal();
		await apply(() => getRoastSharing({ data: slug }));
	}

	function closeDialog(): void {
		if (!dialogRef.current?.open) return;
		setClosing(true);
		clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(() => {
			dialogRef.current?.close();
			setClosing(false);
		}, 140);
	}

	async function changeVisibility(
		visibility: SharingVisibility,
	): Promise<void> {
		await apply(() => updateRoastVisibility({ data: { slug, visibility } }));
	}

	async function addEmail(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		if (await apply(() => addRoastShare({ data: { slug, email } }))) {
			setEmail("");
		}
	}

	async function removeEmail(shareEmail: string): Promise<void> {
		await apply(() => removeRoastShare({ data: { slug, email: shareEmail } }));
	}

	async function copyLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(reportUrl);
			setCopied(true);
			clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopied(false), 1500);
		} catch (copyError) {
			setError(errorMessage(copyError));
		}
	}

	return (
		<>
			<button
				className="report-share__trigger"
				type="button"
				onClick={openDialog}
			>
				Share report
			</button>
			<dialog
				aria-labelledby="share-dialog-title"
				className="share-dialog"
				data-closing={closing || undefined}
				onCancel={(event) => {
					event.preventDefault();
					closeDialog();
				}}
				ref={dialogRef}
			>
				<header className="share-dialog__header">
					<div>
						<p className="mono-label">Report access</p>
						<h2 id="share-dialog-title">Share report</h2>
					</div>
					<button
						aria-label="Close sharing dialog"
						type="button"
						onClick={closeDialog}
					>
						×
					</button>
				</header>

				{sharing ? (
					<>
						<section
							className="share-dialog__section"
							aria-labelledby="link-access-heading"
						>
							<h3 id="link-access-heading">Link access</h3>
							<fieldset className="share-dialog__segments">
								<legend>Link visibility</legend>
								{(["public", "private"] as const).map((visibility) => (
									<button
										aria-pressed={sharing.visibility === visibility}
										disabled={pending}
										key={visibility}
										type="button"
										onClick={() => changeVisibility(visibility)}
									>
										{visibility === "public" ? "Public" : "Private"}
									</button>
								))}
							</fieldset>
							<div className="share-dialog__link">
								<input aria-label="Report URL" readOnly value={reportUrl} />
								<button disabled={pending} type="button" onClick={copyLink}>
									{copied ? "Copied" : "Copy"}
								</button>
							</div>
							{sharing.visibility === "private" && (
								<p className="share-dialog__empty">
									Recipients must sign in with an email listed below.
								</p>
							)}
						</section>

						<section
							className="share-dialog__section"
							aria-labelledby="people-access-heading"
						>
							<h3 id="people-access-heading">People with access</h3>
							<form className="share-dialog__add" onSubmit={addEmail}>
								<label htmlFor="share-email">Email address</label>
								<div>
									<input
										autoComplete="email"
										disabled={pending}
										id="share-email"
										placeholder="person@company.com"
										required
										type="email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
									/>
									<button disabled={pending} type="submit">
										Add
									</button>
								</div>
							</form>
							{sharing.shares.length > 0 ? (
								<ul className="share-dialog__people">
									{sharing.shares.map((share) => (
										<li key={share.email}>
											<span>{share.email}</span>
											<button
												aria-label={`Remove ${share.email}`}
												disabled={pending}
												type="button"
												onClick={() => removeEmail(share.email)}
											>
												×
											</button>
										</li>
									))}
								</ul>
							) : (
								<p className="share-dialog__empty">No people added.</p>
							)}
						</section>
					</>
				) : (
					<p className="share-dialog__loading">Loading sharing settings…</p>
				)}

				{error && (
					<p className="share-dialog__error" role="alert">
						{error}
					</p>
				)}
			</dialog>
		</>
	);
}
