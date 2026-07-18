import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatSyncTime, type LangSmithConnection } from "#/lib/langsmith";
import {
	deleteLangSmithConnection,
	reconnectLangSmithConnection,
	syncLangSmithConnection,
	updateLangSmithStatus,
} from "#/lib/langsmith.functions";

export function LangSmithConnectionCard({
	connection,
	onChanged,
	onDeleted,
}: {
	connection: LangSmithConnection;
	onChanged: (connection: LangSmithConnection) => void;
	onDeleted: (id: string) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [reconnectKey, setReconnectKey] = useState("");

	async function run(action: () => Promise<LangSmithConnection | null>) {
		setBusy(true);
		setError("");
		try {
			const result = await action();
			if (result) onChanged(result);
		} catch {
			setError("Connection action could not be completed.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<article className="rounded-xl border border-stone-200 bg-white p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold text-stone-950">{connection.label}</h2>
					<p className="mt-1 text-sm text-stone-500">
						{connection.project_name} · {connection.workspace_id}
					</p>
				</div>
				<span
					className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(connection.status)}`}
				>
					{connection.status}
				</span>
			</div>
			<div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
				<p className="text-stone-500">
					Last success{" "}
					<span className="block font-medium text-stone-800">
						{formatSyncTime(connection.last_success_at)}
					</span>
				</p>
				<p className="text-stone-500">
					Last scan{" "}
					<span className="block font-medium text-stone-800">
						{connection.last_scan_count} traces
					</span>
				</p>
			</div>
			{connection.last_error ? (
				<p className="mt-4 text-sm text-orange-700" role="alert">
					{safeError(connection.last_error)}
				</p>
			) : null}
			{error ? (
				<p className="mt-4 text-sm text-orange-700" role="alert">
					{error}
				</p>
			) : null}
			{connection.status === "invalid" ? (
				<div className="mt-5 flex flex-wrap items-end gap-2">
					<label className="text-sm font-medium text-stone-700">
						<span className="sr-only">Replacement LangSmith API key</span>
						<input
							className="field min-w-64"
							type="password"
							autoComplete="off"
							value={reconnectKey}
							onChange={(event) => setReconnectKey(event.target.value)}
							placeholder="Replacement API key"
						/>
					</label>
					<button
						type="button"
						disabled={busy || !reconnectKey}
						onClick={() =>
							run(async () => {
								const result = await reconnectLangSmithConnection({
									data: { id: connection.id, api_key: reconnectKey },
								});
								setReconnectKey("");
								return result;
							})
						}
						className="rounded-full border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
					>
						Reconnect
					</button>
				</div>
			) : null}
			<div className="mt-5 flex flex-wrap gap-2">
				<button
					type="button"
					disabled={busy || connection.status !== "active"}
					onClick={() =>
						run(
							async () =>
								(await syncLangSmithConnection({ data: connection.id }))
									.connection,
						)
					}
					className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
				>
					<RefreshCw size={14} aria-hidden="true" /> Scan now
				</button>
				{connection.status === "active" || connection.status === "paused" ? (
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							run(() =>
								updateLangSmithStatus({
									data: {
										id: connection.id,
										status:
											connection.status === "active" ? "paused" : "active",
									},
								}),
							)
						}
						className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
					>
						{connection.status === "active" ? (
							<Pause size={14} aria-hidden="true" />
						) : (
							<Play size={14} aria-hidden="true" />
						)}
						{connection.status === "active" ? "Pause" : "Resume"}
					</button>
				) : null}
				<button
					type="button"
					disabled={busy}
					onClick={() =>
						run(async () => {
							await deleteLangSmithConnection({ data: connection.id });
							onDeleted(connection.id);
							return null;
						})
					}
					className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
				>
					<Trash2 size={14} aria-hidden="true" /> Disconnect
				</button>
			</div>
		</article>
	);
}

function safeError(value: string): string {
	if (value === "invalid_key")
		return "Key rejected. Reconnect with a valid LangSmith key.";
	if (value === "rate_limited")
		return "LangSmith rate limited the last scan. Flint will retry hourly.";
	return "Last scan did not complete. Flint will retry hourly.";
}

function badgeClass(status: LangSmithConnection["status"]): string {
	if (status === "active") return "bg-green-50 text-green-700";
	if (status === "paused") return "bg-stone-100 text-stone-600";
	return "bg-orange-50 text-orange-700";
}
