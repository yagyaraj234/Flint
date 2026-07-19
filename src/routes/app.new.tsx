import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileJson, Upload } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { fieldClass, primaryButton } from "#/components/ui";
import { createUpload } from "#/lib/roast-functions";

export { createUpload } from "#/lib/roast-functions";

export const Route = createFileRoute("/app/new")({ component: NewRoast });

type InputTab = "paste" | "upload";

export function NewRoast() {
	const navigate = useNavigate();
	const [tab, setTab] = useState<InputTab>("paste");
	const [title, setTitle] = useState("");
	const [text, setText] = useState("");
	const [fileName, setFileName] = useState("");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError("");
		try {
			const result = await createUpload({ data: { text, title } });
			await navigate({
				to: "/app/roasts/$batch",
				params: { batch: result.batch_id },
			});
		} catch (submissionError) {
			setError(
				submissionError instanceof Error
					? submissionError.message
					: "Could not upload traces.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main>
			<AppPageHeader
				description="Single object, array, or JSONL. Maximum 20 traces per upload."
				title="Scan traces"
			/>

			<form
				onSubmit={submit}
				className="mt-7 rounded-xl border border-line bg-white p-5 sm:p-7"
			>
				<label className="block text-sm font-medium text-ink" htmlFor="title">
					Title <span className="font-normal text-muted">optional</span>
				</label>
				<input
					id="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					maxLength={120}
					placeholder="Production support agent"
					className={`${fieldClass} mt-2`}
				/>

				<div
					className="mt-6 flex gap-1 border-b border-line"
					role="tablist"
					aria-label="Trace input method"
				>
					<Tab active={tab === "paste"} name="paste" onSelect={setTab}>
						Paste JSON
					</Tab>
					<Tab active={tab === "upload"} name="upload" onSelect={setTab}>
						Upload file
					</Tab>
				</div>

				<div
					aria-labelledby="trace-tab-paste"
					className="mt-4"
					hidden={tab !== "paste"}
					id="trace-panel-paste"
					role="tabpanel"
				>
					<label className="sr-only" htmlFor="trace-json">
						Trace JSON or JSONL
					</label>
					<textarea
						id="trace-json"
						value={text}
						onChange={(event) => setText(event.target.value)}
						rows={13}
						spellCheck={false}
						placeholder={'{"spans":[...]}'}
						className="w-full resize-y rounded-lg border border-ink bg-ink p-4 font-mono text-sm text-neutral-100 outline-none transition duration-150 placeholder:text-neutral-400 focus:border-accent focus:ring-4 focus:ring-accent/20"
					/>
				</div>
				<div
					aria-labelledby="trace-tab-upload"
					hidden={tab !== "upload"}
					id="trace-panel-upload"
					role="tabpanel"
				>
					<label className="mt-4 flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-paper text-center transition-colors duration-150 hover:border-accent">
						<Upload className="text-accent" aria-hidden="true" />
						<span className="mt-3 text-sm font-medium text-ink">
							{fileName || "Choose JSON or JSONL file"}
						</span>
						<span className="mt-1 text-xs text-muted">
							Source and format detected automatically.
						</span>
						<input
							type="file"
							accept=".json,.jsonl,application/json,application/x-ndjson"
							className="sr-only"
							onChange={async (event) => {
								const file = event.target.files?.[0];
								if (!file) return;
								setFileName(file.name);
								setText(await file.text());
							}}
						/>
					</label>
				</div>

				{error && (
					<p className="mt-4 text-sm text-danger" role="alert">
						{error}
					</p>
				)}
				<div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted">
						Helix redacts supported secrets before any row is stored.
					</p>
					<button
						type="submit"
						disabled={submitting}
						className={`${primaryButton} w-full disabled:cursor-wait sm:w-auto`}
					>
						<FileJson size={16} aria-hidden="true" />
						{submitting ? "Staging…" : "Scan traces"}
					</button>
				</div>
			</form>
		</main>
	);
}

function Tab({
	active,
	name,
	onSelect,
	children,
}: {
	active: boolean;
	name: InputTab;
	onSelect: (tab: InputTab) => void;
	children: React.ReactNode;
}) {
	function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
		const next =
			event.key === "ArrowLeft" ||
			event.key === "ArrowUp" ||
			event.key === "Home"
				? "paste"
				: event.key === "ArrowRight" ||
						event.key === "ArrowDown" ||
						event.key === "End"
					? "upload"
					: null;
		if (!next) return;
		event.preventDefault();
		onSelect(next);
		document.getElementById(`trace-tab-${next}`)?.focus();
	}

	return (
		<button
			aria-controls={`trace-panel-${name}`}
			type="button"
			id={`trace-tab-${name}`}
			role="tab"
			aria-selected={active}
			onClick={() => onSelect(name)}
			onKeyDown={selectFromKeyboard}
			tabIndex={active ? 0 : -1}
			className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
		>
			{children}
		</button>
	);
}
