import { fail } from "./errors";
import { buildNciRequest, type NciRequest } from "./request";

/** One read-only API request; deadline covers headers and the complete body. */
export async function nciCtsRead(request: NciRequest, opts?: {apiKey?: string; timeoutMs?: number; maxBytes?: number}) {
  const {url, init, context} = buildNciRequest(request, opts?.apiKey);
  const apiKey = opts?.apiKey as string;
  const sourceUrl = url.toString();
  const controller = new AbortController();
  const maxBytes = opts?.maxBytes ?? 4 * 1024 * 1024;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, opts?.timeoutMs ?? 50_000);
  });
  try {
    try {
      const pending = Promise.resolve(fetch(url.toString(), { ...init, redirect: "manual", signal: controller.signal })).then(value => {
        if (controller.signal.aborted) { void value.body?.cancel().catch(() => {}); throw new Error("deadline"); }
        return value;
      });
      response = await Promise.race([pending, expired]);
    } catch { fail("NCI CTS request failed or timed out", 502); }
    if (Number(response.headers.get("content-length")) > maxBytes) fail("NCI CTS response exceeds byte limit (default 4 MiB)", 502);
    reader = response.body?.getReader();
    const { digest, size, raw, original } = await readRedactedBody(reader, expired, maxBytes, apiKey);
    const provenance = { source_url: sourceUrl, request: context, retrieved_at: new Date().toISOString(),
      response_sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""),
      response_bytes: size, raw_json: raw, redacted: raw !== original };
    return await decodeCtsResponse(response, raw, provenance);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    else if (response) void response.body?.cancel().catch(() => {});
  }
}

async function decodeCtsResponse(response: Response, raw: string, provenance: { source_url: string; request: { body: unknown; method: string; path: string; } | { params: Record<string, unknown>; method: string; path: string; }; retrieved_at: string; response_sha256: string; response_bytes: number; raw_json: string; redacted: boolean; }) {
  const evidence = {
    upstream_http_status: response.status, retry_after: response.headers.get("retry-after"),
    content_type: response.headers.get("content-type"), text: raw, provenance
  };
  if (response.status !== 200 || response.headers.has("content-range")) {
    fail(`NCI CTS HTTP ${response.status}`, response.status === 200 ? 502 : response.status, evidence);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw.replace(/^\uFEFF/, ""), (key, value) => /^api_?key$/i.test(key) ? undefined : value); }
  catch { fail("NCI CTS returned invalid JSON", 502, evidence); }
  if (!parsed || typeof parsed !== "object") fail("Invalid NCI CTS response", 502, evidence);
  const data = parsed as Record<string, unknown> | unknown[];
  const envelope = Array.isArray(data) ? {} : data;
  if (envelope.error != null && envelope.error !== false || Array.isArray(envelope.errors) && envelope.errors.length > 0 || envelope.success === false) fail("NCI CTS returned an API error envelope", 502, evidence);
  const redactedDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  return {
    status: response.status, data, provenance: {
      ...provenance, api_version: null,
      redacted_json_sha256: Array.from(new Uint8Array(redactedDigest), b => b.toString(16).padStart(2, "0")).join("")
    }
  };
}

async function readRedactedBody(reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>> | undefined, expired: Promise<never>, maxBytes: number, apiKey: string) {
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (reader) {
      const { value, done } = await Promise.race([reader.read(), expired]); if (done) break;
      size += value.byteLength; if (size > maxBytes) fail("Response exceeds byte limit", 502);
      chunks.push(value);
    }
  } catch { fail("NCI CTS response unreadable, timed out or exceeds byte limit (default 4 MiB)", 502); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "\uFEFF" : "") + new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes); }
  catch { fail("NCI CTS returned invalid UTF-8", 502); }
  const original = raw;
  // Decode JSON string tokens before redaction so Unicode-escaped echoes cannot leak the key.
  raw = raw.replace(/"(?:[^"\\]|\\.)*"/g, token => {
    try {
      const decoded = JSON.parse(token) as string;
      const safe = decoded.split(apiKey).join("[REDACTED]").split(encodeURIComponent(apiKey)).join("[REDACTED]");
      return safe === decoded ? token : JSON.stringify(safe);
    } catch { return token; }
  });
  for (const value of new Set([apiKey, encodeURIComponent(apiKey), JSON.stringify(apiKey).slice(1, -1)])) raw = raw.split(value).join("[REDACTED]");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { digest, size, raw, original };
}
