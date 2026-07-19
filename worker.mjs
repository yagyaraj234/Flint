import server from "./dist/server/server.js";

async function runLangSmithSync(env) {
	if (!env.API_URL || !env.CRON_SECRET) {
		console.error("LangSmith sync job is not configured.");
		return;
	}
	const response = await fetch(
		`${env.API_URL.replace(/\/$/, "")}/internal/jobs/langsmith-sync`,
		{ method: "POST", headers: { "x-cron-secret": env.CRON_SECRET } },
	);
	if (!response.ok) {
		console.error(`LangSmith sync job failed with status ${response.status}.`);
	}
}

export default {
	fetch(...args) {
		return server.fetch(...args);
	},
	scheduled(_controller, env, ctx) {
		ctx.waitUntil(runLangSmithSync(env));
	},
};
