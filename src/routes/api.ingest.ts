import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ingest")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const expectedToken =
					process.env.INGEST_TOKEN ??
					(process.env.HELIX_DEMO === "true"
						? "helix-demo-ingest-token"
						: undefined);
				if (!expectedToken) {
					return Response.json(
						{ error: "Ingest is not configured." },
						{ status: 503 },
					);
				}
				if (
					!(await validBearer(
						request.headers.get("authorization"),
						expectedToken,
					))
				) {
					return Response.json({ error: "Unauthorized." }, { status: 401 });
				}

				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json(
						{ error: "Invalid JSON body." },
						{ status: 400 },
					);
				}
				const payload =
					body && typeof body === "object" && !Array.isArray(body)
						? (body as Record<string, unknown>)
						: {};
				if (
					!payload.trace ||
					typeof payload.trace !== "object" ||
					Array.isArray(payload.trace)
				) {
					return Response.json(
						{ error: "trace must be a JSON object." },
						{ status: 400 },
					);
				}
				const title =
					typeof payload.title === "string" ? payload.title.trim() : undefined;
				if (title && title.length > 120) {
					return Response.json(
						{ error: "title must be 120 characters or less." },
						{ status: 400 },
					);
				}

				try {
					const [{ parseSource }, { ingestTrace }] = await Promise.all([
						import("#/lib/ingest"),
						import("#/lib/api"),
					]);
					const result = await ingestTrace({
						trace: payload.trace as Record<string, unknown>,
						title,
						source: parseSource(payload.source, "live"),
						format:
							payload.format === "openai-agents" || payload.format === "generic"
								? payload.format
								: undefined,
					});
					return Response.json(result, { status: 201 });
				} catch {
					return Response.json({ error: "Ingest failed." }, { status: 500 });
				}
			},
		},
	},
});

async function validBearer(header: string | null, expected: string) {
	if (!header?.startsWith("Bearer ")) return false;
	const token = header.slice(7);
	const tokenBytes = Buffer.from(token);
	const expectedBytes = Buffer.from(expected);
	if (tokenBytes.length !== expectedBytes.length) return false;
	const { timingSafeEqual } = await import("node:crypto");
	return timingSafeEqual(tokenBytes, expectedBytes);
}
