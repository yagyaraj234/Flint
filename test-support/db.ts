// @ts-expect-error Bun provides this module at test runtime; Bun types are not installed.
import { mock } from "bun:test";

export type QueryResponse = {
	count?: number | null;
	data?: unknown;
	error?: { message: string } | null;
	throwOn?: string;
	throwValue?: unknown;
};

export const queryResponses: QueryResponse[] = [];
export const queries: Array<{ calls: Array<[string, unknown[]]> }> = [];
let fromError: unknown;

function query(response: QueryResponse) {
	const calls: Array<[string, unknown[]]> = [];
	const result = {
		count: response.count,
		data: response.data,
		error: response.error ?? null,
		calls,
	} as Record<string, unknown> & { calls: Array<[string, unknown[]]> };
	for (const method of [
		"select",
		"eq",
		"neq",
		"order",
		"limit",
		"maybeSingle",
		"is",
		"insert",
		"update",
	]) {
		result[method] = (...args: unknown[]) => {
			calls.push([method, args]);
			if (response.throwOn === method) throw response.throwValue;
			return result;
		};
	}
	result.then = (resolve: (value: unknown) => unknown) =>
		Promise.resolve({
			count: response.count,
			data: response.data,
			error: response.error ?? null,
		}).then(resolve);
	queries.push(result);
	return result;
}

export const db = {
	from: mock(() => {
		if (fromError !== undefined) throw fromError;
		return query(queryResponses.shift() ?? {});
	}),
};

export function resetDb() {
	queryResponses.length = 0;
	queries.length = 0;
	fromError = undefined;
	db.from.mockClear();
}

export function setDbError(error: unknown) {
	fromError = error;
}
