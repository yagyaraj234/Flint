import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import shellCss from "../shells.css?url";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	notFoundComponent: RootNotFound,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "theme-color", content: "#0C0A09" },
			{ title: "Flint — Security scanning for AI agent traces" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "stylesheet", href: shellCss },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap",
			},
			{
				rel: "stylesheet",
				href: "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap",
			},
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "manifest", href: "/manifest.json" },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body suppressHydrationWarning>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootNotFound() {
	return (
		<main className="root-not-found">
			<p className="mono-label">404 · PAGE NOT FOUND</p>
			<h1>Nothing here.</h1>
			<a className="button" href="/">
				Back to Flint
			</a>
		</main>
	);
}
