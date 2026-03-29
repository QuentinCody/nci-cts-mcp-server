import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { nciCtsFetch, nciCtsPost } from "./http";

interface NciCtsAdapterEnv {
    NCI_API_KEY?: string;
}

export function createNciCtsApiFetch(env?: NciCtsAdapterEnv): ApiFetchFn {
    const apiKey = env?.NCI_API_KEY;

    return async (request) => {
        const path = request.path;

        // POST /trials — structured trial search
        if (path === "/trials" && request.method === "POST") {
            const body = (request.body ?? {}) as Record<string, unknown>;
            const response = await nciCtsPost("/trials", body, { apiKey });

            if (!response.ok) {
                let errorBody: string;
                try {
                    errorBody = await response.text();
                } catch {
                    errorBody = response.statusText;
                }
                const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                    status: number;
                    data: unknown;
                };
                error.status = response.status;
                error.data = errorBody;
                throw error;
            }

            const data = await response.json();
            return { status: response.status, data };
        }

        // All other endpoints are GET
        const response = await nciCtsFetch(path, request.params, { apiKey });

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
