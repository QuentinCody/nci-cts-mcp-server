export function fail(message: string, status = 400, data?: unknown): never { throw Object.assign(new Error(message), {status, data}); }
