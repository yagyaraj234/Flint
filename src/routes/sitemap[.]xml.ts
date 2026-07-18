import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const origin = new URL(request.url).origin;
				const roasts = await publicRoasts();
				const urls = [
					`  <url><loc>${origin}/</loc></url>`,
					`  <url><loc>${origin}/ai-agent-trace-analyzer</loc></url>`,
					...roasts.map(
						({ createdAt, slug }) =>
							`  <url><loc>${origin}/r/${encodeURIComponent(slug)}</loc><lastmod>${createdAt}</lastmod></url>`,
					),
				];

				return new Response(
					`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
					{ headers: { "Content-Type": "application/xml; charset=utf-8" } },
				);
			},
		},
	},
});

async function publicRoasts(): Promise<
	Array<{ createdAt: string; slug: string }>
> {
	try {
		const { getRecentRoasts } = await import("#/lib/api");
		return (await getRecentRoasts()).map((row) => ({
			createdAt: row.created_at,
			slug: row.slug,
		}));
	} catch {
		return [];
	}
}
