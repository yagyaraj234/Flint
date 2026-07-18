import { afterEach, describe, expect, test, vi } from "vitest";

import { getMyRoasts, getRoast, ingestBatch, ingestTrace } from "./api";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	fetchMock.mockReset();
});

describe("FastAPI helpers", () => {
	test("sends owner batch requests with the Supabase bearer token", async () => {
		globalThis.fetch = fetchMock as typeof fetch;
		fetchMock.mockResolvedValueOnce(
			Response.json({
				batch_id: "batch-id",
				results: [{ error: null, slug: "one", status: "done" }],
			}),
		);
		await ingestBatch({ title: "Trace", traces: [{}] }, "access-token");
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/ingest/batch",
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: "Bearer access-token",
				}),
				method: "POST",
			}),
		);

		fetchMock.mockResolvedValueOnce(Response.json([]));
		await getMyRoasts("access-token", "batch id");
		expect(fetchMock).toHaveBeenLastCalledWith(
			"http://localhost:8000/me/roasts?batch_id=batch%20id",
			{ headers: { authorization: "Bearer access-token" } },
		);
	});

	test("keeps single ingest anonymous and treats public 404s as missing", async () => {
		globalThis.fetch = fetchMock as typeof fetch;
		fetchMock.mockResolvedValueOnce(Response.json({ slug: "live" }));
		await expect(ingestTrace({ source: "live", trace: {} })).resolves.toEqual({
			slug: "live",
		});
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			headers: { "content-type": "application/json" },
		});

		fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
		await expect(getRoast("missing")).resolves.toBeNull();

		fetchMock.mockResolvedValueOnce(Response.json({ slug: "private" }));
		await getRoast("private", "access-token");
		expect(fetchMock).toHaveBeenLastCalledWith(
			"http://localhost:8000/roasts/private",
			{ headers: { authorization: "Bearer access-token" } },
		);
	});
});
