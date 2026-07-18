import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { FileJson, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";

const createUpload = createServerFn({ method: "POST" })
	.validator((value: unknown) => {
		const input =
			value && typeof value === "object"
				? (value as Record<string, unknown>)
				: {};
		if (typeof input.text !== "string")
			throw new Error("Trace JSON is required.");
		const title = typeof input.title === "string" ? input.title.trim() : "";
		if (title.length > 120)
			throw new Error("Title must be 120 characters or less.");
		return { text: input.text, title };
	})
	.handler(async ({ data }) => {
		const [
			{ parseTraceDataset },
			{ stageDataset },
			{ requireAuthenticatedUser },
		] = await Promise.all([
			import("#/lib/ingest"),
			import("#/lib/pipeline.server"),
			import("#/lib/supabase-auth.server"),
		]);
		const user = await requireAuthenticatedUser();
		return stageDataset({
			traces: parseTraceDataset(data.text),
			title: data.title || undefined,
			userId: user.id,
		});
	});

export const Route = createFileRoute("/app/new")({ component: NewRoast });

function NewRoast() {
	const navigate = useNavigate();
	const [tab, setTab] = useState<"paste" | "upload">("paste");
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
				params: { batch: result.batchId },
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
		<main className="mx-auto max-w-4xl p-5 lg:p-8">
			<p className="text-xs font-medium uppercase tracking-wider text-stone-400">
				Dashboard / New roast
			</p>
			<h1 className="mt-2 text-3xl font-semibold tracking-tight">
				Roast new traces
			</h1>
			<p className="mt-1 text-sm text-stone-500">
				Single object, array, or JSONL. Maximum 20 traces per upload.
			</p>

			<form
				onSubmit={submit}
				className="mt-7 rounded-xl border border-stone-200 bg-white p-5 sm:p-7"
			>
				<label className="block text-sm font-medium" htmlFor="title">
					Title <span className="font-normal text-stone-400">optional</span>
				</label>
				<input
					id="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					maxLength={120}
					placeholder="Production support agent"
					className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
				/>

				<div
					className="mt-6 flex gap-1 border-b border-stone-200"
					role="tablist"
					aria-label="Trace input method"
				>
					<Tab active={tab === "paste"} onClick={() => setTab("paste")}>
						Paste JSON
					</Tab>
					<Tab active={tab === "upload"} onClick={() => setTab("upload")}>
						Upload file
					</Tab>
				</div>

				{tab === "paste" ? (
					<div className="mt-4" role="tabpanel">
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
							className="w-full resize-y rounded-lg border border-stone-200 bg-stone-950 p-4 font-mono text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-orange-500"
						/>
					</div>
				) : (
					<label
						className="mt-4 flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-center hover:border-orange-400"
						role="tabpanel"
					>
						<Upload className="text-orange-600" aria-hidden="true" />
						<span className="mt-3 text-sm font-medium">
							{fileName || "Choose JSON or JSONL file"}
						</span>
						<span className="mt-1 text-xs text-stone-500">
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
				)}

				{error && (
					<p className="mt-4 text-sm text-orange-700" role="alert">
						{error}
					</p>
				)}
				<div className="mt-5 flex items-center justify-between gap-4">
					<p className="text-xs text-stone-500">
						Secrets are redacted before any row is stored.
					</p>
					<button
						type="submit"
						disabled={submitting}
						className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60"
					>
						<FileJson size={16} aria-hidden="true" />
						{submitting ? "Staging…" : "Roast traces"}
					</button>
				</div>
			</form>
		</main>
	);
}

function Tab({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={`border-b-2 px-4 py-2.5 text-sm font-medium ${active ? "border-orange-600 text-orange-700" : "border-transparent text-stone-500 hover:text-stone-900"}`}
		>
			{children}
		</button>
	);
}
