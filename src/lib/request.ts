import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { fail } from "./errors";
export type NciRequest = Parameters<ApiFetchFn>[0];
const credential = /^(?:api[_-]?key|x-api-key|authorization)$/i;

function searchBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Trial search requires a JSON object");
  let encoded: string;
  try {
    encoded = JSON.stringify(body, (key, value) => {
      if (credential.test(key)) fail("Configure NCI_API_KEY on the Worker; do not submit credentials in filters");
      if (typeof value === "number" && !Number.isFinite(value)) fail("Trial filters require finite numbers");
      return value;
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    fail("Trial search body must be JSON serializable");
  }
  if (new TextEncoder().encode(encoded).byteLength > 128 * 1024) fail("Trial search body exceeds the local 128 KiB bound");
  return encoded;
}

function queryParams(url: URL, params: Record<string, unknown>) {
  for (const [key, value] of Object.entries(params)) {
    if (credential.test(key)) fail("Configure NCI_API_KEY on the Worker; do not submit credentials as query parameters");
    if (value === null || value === undefined) continue;
    const items = Array.isArray(value) ? value : [value];
    if (items.length > 100) fail("Use at most 100 values per query parameter");
    for (const item of items) {
      if (!["string", "number", "boolean"].includes(typeof item) || String(item).length > 4000
        || typeof item === "number" && !Number.isFinite(item)) fail("Use bounded scalar query values or repeated scalar arrays");
      url.searchParams.append(key, String(item));
    }
  }
  if (url.toString().length > 32000) fail("NCI CTS query exceeds the local URL bound");
}

export function buildNciRequest(request: NciRequest, apiKey?: string) {
  const {method, path, params = {}, body} = request;
  if (!/^\/(?:trials(?:\/[A-Za-z0-9_-]{1,100})?|diseases|interventions|biomarkers|organizations|terms|countries)$/.test(path)) fail("Use a supported relative NCI CTS resource path");
  if (method !== "GET" && method !== "POST" || method === "POST" && path !== "/trials") fail("NCI CTS supports GET reads and POST /trials searches");
  if (method === "GET" && body !== undefined) fail("GET requests cannot contain a body");
  if (method === "POST" && Object.keys(params).length) fail("Put trial-search filters in the JSON body; query parameters are not silently ignored");
  if (!apiKey?.trim()) fail("NCI_API_KEY is required", 401);
  const url = new URL("https://clinicaltrialsapi.cancer.gov/api/v2" + path);
  const headers: Record<string, string> = {Accept: "application/json", "X-API-KEY": apiKey};
  const init: RequestInit = {method, headers};
  if (method === "POST") {
    init.body = searchBody(body ?? {});
    headers["Content-Type"] = "application/json";
  } else queryParams(url, params);
  return {url, init, context: {method, path, ...(method === "POST" ? {body: JSON.parse(String(init.body))} : {params})}};
}
