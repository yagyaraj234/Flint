import { createServerFn } from "@tanstack/react-start";

import {
	type LangSmithConnection,
	type LangSmithConnectionInput,
	type Project,
	validateConnectionId,
	validateConnectionInput,
	validateDiscoverInput,
	validateKeyInput,
	validateReconnectInput,
	validateStatusUpdate,
	type Workspace,
} from "./langsmith";
import { requireAuthenticatedUser } from "./supabase-auth.server";

const apiUrl = process.env.API_URL ?? "http://localhost:8000";

async function api<T>(
	path: string,
	userId: string,
	init: RequestInit = {},
): Promise<T> {
	const token = process.env.INTERNAL_API_TOKEN;
	if (!token) throw new Error("Integration service is not configured.");
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			"content-type": "application/json",
			"x-internal-api-token": token,
			"x-user-id": userId,
			...init.headers,
		},
	});
	if (!response.ok)
		throw new Error("LangSmith request could not be completed.");
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export const getLangSmithConnections = createServerFn({
	method: "GET",
}).handler(async (): Promise<LangSmithConnection[]> => {
	const user = await requireAuthenticatedUser();
	return api<LangSmithConnection[]>("/integrations/langsmith", user.id);
});

export const validateLangSmithKey = createServerFn({ method: "POST" })
	.validator(validateKeyInput)
	.handler(async ({ data }): Promise<{ workspaces: Workspace[] }> => {
		const user = await requireAuthenticatedUser();
		return api("/integrations/langsmith/validate-key", user.id, {
			method: "POST",
			body: JSON.stringify(data),
		});
	});

export const discoverLangSmithProjects = createServerFn({ method: "POST" })
	.validator(validateDiscoverInput)
	.handler(async ({ data }): Promise<{ projects: Project[] }> => {
		const user = await requireAuthenticatedUser();
		return api("/integrations/langsmith/discover", user.id, {
			method: "POST",
			body: JSON.stringify(data),
		});
	});

export const createLangSmithConnection = createServerFn({ method: "POST" })
	.validator(validateConnectionInput)
	.handler(async ({ data }): Promise<LangSmithConnection> => {
		const user = await requireAuthenticatedUser();
		return api<LangSmithConnection>("/integrations/langsmith", user.id, {
			method: "POST",
			body: JSON.stringify(data satisfies LangSmithConnectionInput),
		});
	});

export const updateLangSmithStatus = createServerFn({ method: "POST" })
	.validator(validateStatusUpdate)
	.handler(async ({ data }): Promise<LangSmithConnection> => {
		const user = await requireAuthenticatedUser();
		return api<LangSmithConnection>(
			`/integrations/langsmith/${encodeURIComponent(data.id)}`,
			user.id,
			{
				method: "PATCH",
				body: JSON.stringify({ status: data.status }),
			},
		);
	});

export const syncLangSmithConnection = createServerFn({ method: "POST" })
	.validator(validateConnectionId)
	.handler(
		async ({
			data,
		}): Promise<{
			scanned: number;
			connection: LangSmithConnection | null;
		}> => {
			const user = await requireAuthenticatedUser();
			return api(
				`/integrations/langsmith/${encodeURIComponent(data)}/sync`,
				user.id,
				{ method: "POST" },
			);
		},
	);

export const reconnectLangSmithConnection = createServerFn({ method: "POST" })
	.validator(validateReconnectInput)
	.handler(async ({ data }): Promise<LangSmithConnection> => {
		const user = await requireAuthenticatedUser();
		return api<LangSmithConnection>(
			`/integrations/langsmith/${encodeURIComponent(data.id)}`,
			user.id,
			{
				method: "PATCH",
				body: JSON.stringify({ api_key: data.api_key, status: "active" }),
			},
		);
	});

export const deleteLangSmithConnection = createServerFn({ method: "POST" })
	.validator(validateConnectionId)
	.handler(async ({ data }): Promise<void> => {
		const user = await requireAuthenticatedUser();
		await api(`/integrations/langsmith/${encodeURIComponent(data)}`, user.id, {
			method: "DELETE",
		});
	});
