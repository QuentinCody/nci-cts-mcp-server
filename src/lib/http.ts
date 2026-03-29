import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const NCI_CTS_BASE = "https://clinicaltrialsapi.cancer.gov/api/v2";

export interface NciCtsFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
    apiKey?: string;
}

/**
 * Fetch from the NCI Clinical Trials Search API v2.
 * Requires NCI_API_KEY passed via X-API-KEY header.
 */
export async function nciCtsFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: NciCtsFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? NCI_CTS_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    if (opts?.apiKey) {
        headers["X-API-KEY"] = opts.apiKey;
    }

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "nci-cts-mcp-server/1.0 (bio-mcp)",
    });
}

/**
 * POST to the NCI CTS API (used for trial search).
 */
export async function nciCtsPost(
    path: string,
    body: Record<string, unknown>,
    opts?: NciCtsFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? NCI_CTS_BASE;
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
    };

    if (opts?.apiKey) {
        headers["X-API-KEY"] = opts.apiKey;
    }

    return fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}
