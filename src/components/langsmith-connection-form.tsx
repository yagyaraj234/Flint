import { useState } from "react";
import type { LangSmithConnection, Project, Workspace } from "#/lib/langsmith";
import {
	createLangSmithConnection,
	discoverLangSmithProjects,
	validateLangSmithKey,
} from "#/lib/langsmith.functions";

const defaultEndpoint = "https://api.smith.langchain.com";

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
			className="langsmith-form"
			onSubmit={connect}
		>
			<div className="langsmith-form__fields">
				<Field id="langsmith-label" label="Connection label">
					<input
						id="langsmith-label"
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						maxLength={120}
						required
						className="field"
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
						className="field"
						type="url"
						list="langsmith-endpoints"
					/>
					<datalist id="langsmith-endpoints">
						<option value="https://api.smith.langchain.com" />
						<option value="https://eu.api.smith.langchain.com" />
					</datalist>
				</Field>
			</div>
			<div className="langsmith-form__key-row">
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
						className="field"
						type="password"
					/>
				</Field>
				<button
					type="button"
					disabled={busy || !apiKey}
					onClick={validateKey}
					className="langsmith-form__validate"
				>
					Validate key
				</button>
			</div>
			{workspaces.length ? (
				<div className="langsmith-form__scope">
					<p className="settings-eyebrow">Project scope</p>
					<Field id="langsmith-workspace" label="Workspace">
						<select
							id="langsmith-workspace"
							className="field"
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
							className="field"
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
				<p className="langsmith-form__confirmation">
					{projectName} will be scanned hourly. The first pass covers the last
					24 hours, up to 50 completed traces.
				</p>
			) : null}
			{error ? (
				<p className="mt-4 text-sm text-orange-700" role="alert">
					{error}
				</p>
			) : null}
			<button
				type="submit"
				disabled={busy || !validated || !workspaceId || !projectName}
				className="langsmith-form__submit"
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
		<div className={`block text-sm font-medium text-stone-800 ${className}`}>
			<label htmlFor={id}>{label}</label>
			<span className="mt-1.5 block">{children}</span>
		</div>
	);
}
