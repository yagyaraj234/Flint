import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/roasts/$batch")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/scans/batches/$batch",
			params: { batch: params.batch },
		});
	},
});
