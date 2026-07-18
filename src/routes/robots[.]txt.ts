import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: ({ request }) =>
				new Response(
					[
						"User-agent: *",
						"Allow: /",
						"Disallow: /api/",
						`Sitemap: ${new URL("/sitemap.xml", request.url)}`,
						"",
					].join("\n"),
					{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
				),
		},
	},
});
