import { useState } from "react";
import type { LangSmithConnection, Project, Workspace } from "#/lib/langsmith";
import {
	createLangSmithConnection,
	discoverLangSmithProjects,
	validateLangSmithKey,
} from "#/lib/langsmith.functions";
import { fieldClass, monoLabel } from "./ui";

const defaultEndpoint = "https://api.smith.langchain.com";
const schedules = [
	{ label: "Every 30 minutes", value: "*/30 * * * *" },
	{ label: "Every hour", value: "0 * * * *" },
	{ label: "Every 12 hours", value: "0 */12 * * *" },
	{ label: "Every 24 hours", value: "0 0 * * *" },
];

export function LangSmithConnectionForm({
	onConnected,
}: {
	onConnected: (connection: LangSmithConnection) => void;
}) {
	const [label, setLabel] = useState("");
	const [endpoint, setEndpoint] = useState(defaultEndpoint);
	const [apiKey, setApiKey] = useState("");
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [workspaceId, setWorkspaceId] = useState("");
	const [projects, setProjects] = useState<Project[]>([]);
	const [projectName, setProjectName] = useState("");
	const [schedule, setSchedule] = useState("0 * * * *");
	const [customCron, setCustomCron] = useState("");
	const [validatedFor, setValidatedFor] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const validated = validatedFor === `${endpoint}\u0000${apiKey}`;

	function clearValidation() {
		setValidatedFor("");
		setWorkspaces([]);
		setWorkspaceId("");
		setProjects([]);
		setProjectName("");
	}

	async function validateKey() {
		const validationKey = `${endpoint}\u0000${apiKey}`;
		setBusy(true);
		setError("");
		clearValidation();
		try {
			const result = await validateLangSmithKey({
				data: { endpoint, api_key: apiKey },
			});
			setWorkspaces(result.workspaces);
			if (!result.workspaces.length) {
				setError("No workspaces are available for this key.");
			} else {
				setValidatedFor(validationKey);
			}
		} catch {
			setError(
				"Key validation failed. Check endpoint and key, then try again.",
			);
		} finally {
			setBusy(false);
		}
	}

	async function loadProjects(nextWorkspaceId: string) {
		setWorkspaceId(nextWorkspaceId);
		setProjects([]);
		setProjectName("");
		if (!nextWorkspaceId) return;
		setBusy(true);
		setError("");
		try {
			const result = await discoverLangSmithProjects({
				data: { endpoint, api_key: apiKey, workspace_id: nextWorkspaceId },
			});
			setProjects(result.projects);
			if (!result.projects.length)
				setError("No projects are available in this workspace.");
		} catch {
			setError("Could not load projects for this workspace.");
		} finally {
			setBusy(false);
		}
	}

	async function connect(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError("");
		try {
			const connection = await createLangSmithConnection({
				data: {
					label,
					endpoint,
					api_key: apiKey,
					workspace_id: workspaceId,
					project_name: projectName,
					sync_cron: schedule === "custom" ? customCron : schedule,
				},
			});
			setApiKey("");
			clearValidation();
			onConnected(connection);
		} catch {
			setError("Could not save this LangSmith connection.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<form
			aria-label="LangSmith connection"
			className="max-w-2xl"
			onSubmit={connect}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field id="langsmith-label" label="Connection label">
					<input
						id="langsmith-label"
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						maxLength={120}
						required
						className={fieldClass}
						placeholder="Production support"
					/>
				</Field>
				<Field id="langsmith-endpoint" label="LangSmith endpoint">
					<input
						id="langsmith-endpoint"
						value={endpoint}
						onChange={(event) => {
							setEndpoint(event.target.value);
							clearValidation();
						}}
						required
						className={fieldClass}
						type="url"
						list="langsmith-endpoints"
					/>
					<datalist id="langsmith-endpoints">
						<option value="https://api.smith.langchain.com" />
						<option value="https://eu.api.smith.langchain.com" />
					</datalist>
				</Field>
			</div>
			<div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
				<Field
					id="langsmith-api-key"
					label="LangSmith API key"
					className="min-w-64 flex-1"
				>
					<input
						id="langsmith-api-key"
						value={apiKey}
						onChange={(event) => {
							setApiKey(event.target.value);
							clearValidation();
						}}
						autoComplete="off"
						required
						className={fieldClass}
						type="password"
					/>
				</Field>
				<button
					type="button"
					disabled={busy || !apiKey}
					onClick={validateKey}
					className="min-h-12 rounded-[10px] bg-surface-alt px-4.5 text-sm font-semibold text-neutral-700 transition duration-150 ease-out hover:bg-line active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
				>
					Validate key
				</button>
			</div>
			{workspaces.length ? (
				<div className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
					<p className={`${monoLabel} text-accent sm:col-span-2`}>
						Project scope
					</p>
					<Field id="langsmith-workspace" label="Workspace">
						<select
							id="langsmith-workspace"
							className={fieldClass}
							value={workspaceId}
							onChange={(event) => void loadProjects(event.target.value)}
							required
						>
							<option value="">Choose workspace</option>
							{workspaces.map((workspace) => (
								<option key={workspace.id} value={workspace.id}>
									{workspace.name}
								</option>
							))}
						</select>
					</Field>
					<Field id="langsmith-project" label="Project">
						<select
							id="langsmith-project"
							className={fieldClass}
							value={projectName}
							onChange={(event) => setProjectName(event.target.value)}
							required
							disabled={!projects.length}
						>
							<option value="">Choose project</option>
							{projects.map((project) => (
								<option key={project.name} value={project.name}>
									{project.name}
								</option>
							))}
						</select>
					</Field>
				</div>
			) : null}
			{validated && workspaceId && projectName ? (
				<div className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
					<Field id="langsmith-schedule" label="Sync schedule">
						<select
							id="langsmith-schedule"
							className={fieldClass}
							value={schedule}
							onChange={(event) => setSchedule(event.target.value)}
						>
							{schedules.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
							<option value="custom">Custom cron</option>
						</select>
					</Field>
					{schedule === "custom" ? (
						<Field id="langsmith-custom-cron" label="Custom cron (UTC)">
							<input
								id="langsmith-custom-cron"
								value={customCron}
								onChange={(event) => setCustomCron(event.target.value)}
								placeholder="0 9 * * 1-5"
								required
								className={fieldClass}
							/>
						</Field>
					) : null}
					<p className="text-[13px] leading-relaxed text-muted sm:col-span-2">
						{projectName} starts with the last 24 hours, up to 50 completed
						traces. Custom cron uses five fields in UTC and must run on :00 or
						:30.
					</p>
				</div>
			) : null}
			{error ? (
				<p className="mt-4 text-sm text-danger" role="alert">
					{error}
				</p>
			) : null}
			<button
				type="submit"
				disabled={
					busy ||
					!validated ||
					!workspaceId ||
					!projectName ||
					(schedule === "custom" && !customCron.trim())
				}
				className="mt-8 min-h-12 w-full rounded-[10px] bg-ink text-sm font-semibold text-white transition duration-150 ease-out hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
			>
				{busy ? "Connecting…" : "Connect LangSmith"}
			</button>
		</form>
	);
}

function Field({
	children,
	className = "",
	id,
	label,
}: {
	children: React.ReactNode;
	className?: string;
	id: string;
	label: string;
}) {
	return (
		<div className={`block text-sm font-medium text-ink ${className}`}>
			<label htmlFor={id}>{label}</label>
			<span className="mt-1.5 block">{children}</span>
		</div>
	);
}
