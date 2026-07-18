import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone test config: vite.config.ts loads tanstackStart(), whose
// createServerFn transform rewrites server functions into SSR RPC stubs and
// breaks calling them directly in tests. Tests mock @tanstack/react-start
// instead, so the plugin must stay out of the test pipeline.
const config = defineConfig({
	plugins: [viteReact()],
	resolve: { tsconfigPaths: true },
});

export default config;
