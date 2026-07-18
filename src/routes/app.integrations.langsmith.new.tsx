import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import { LangSmithConnectionForm } from "#/components/langsmith-connection-form";

export const Route = createFileRoute("/app/integrations/langsmith/new")({
	component: ConnectLangSmith,
});

function ConnectLangSmith() {
	const navigate = useNavigate();
	return (
		<div className="app-page langsmith-setup-page">
			<AppPageHeader
				description="Use a workspace-scoped service key when possible. The first scan checks the last 24 hours, up to 50 completed traces; your key is encrypted and never shown again."
				title="Connect LangSmith"
			/>
			<LangSmithConnectionForm
				onConnected={() => void navigate({ to: "/app/integrations" })}
			/>
		</div>
	);
}
