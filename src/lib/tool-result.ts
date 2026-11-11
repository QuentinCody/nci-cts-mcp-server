import { buildCitation, type Completeness, mergeCompleteness } from "@bio-mcp/shared";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";
import { nciCtsCompleteness } from "./completeness";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
type Result = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean; [key: string]: unknown };
export type NciCtsDataEnv = { NCI_CTS_DATA_DO?: unknown };
export const NCI_CTS_SOURCE = { id: "nci_cts", name: "NCI Clinical Trials Search", url: "https://www.cancer.gov/about-cancer/treatment/clinical-trials", license: "U.S. Public Domain" };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
// The MCP SDK adds resultType and serverInfo after this callback returns.
const TRANSPORT_METADATA_RESERVE = 1024;

function sourceFor(structured: Record<string, unknown>) {
  const meta = record(structured._meta) ? structured._meta : {};
  const sourceValue = record(meta.citation) && record(meta.citation.source) ? meta.citation.source
    : record(structured.data) && record(structured.data.source) ? structured.data.source : record(meta.source) ? meta.source : undefined;
  return sourceValue && typeof sourceValue.id === "string" && typeof sourceValue.name === "string" && typeof sourceValue.url === "string"
    ? { id: sourceValue.id, name: sourceValue.name, url: sourceValue.url,
      ...(typeof sourceValue.license === "string" ? { license: sourceValue.license } : {}) } : NCI_CTS_SOURCE;
}
async function cite(structured: Record<string, unknown>, toolName: string, query: unknown) {
  const meta = record(structured._meta) ? structured._meta : {};
  if (record(meta.citation)) return structured;
  const { _meta: _metadata, ...root } = structured;
  const source = sourceFor(structured);
  const citation = await buildCitation({ source, server: "nci_cts", tool: toolName.replace(/^mcp_/, ""), query,
    queryScope: "tool_arguments", result: root, resultScope: "structured_content:root_without_meta", retrievedAt: new Date().toISOString() });
  return { ...structured, _meta: { ...meta, citation } };
}

/** Cite every response and stage the complete composed MCP envelope above 30KiB. */
export async function nciCtsResponse(work: () => Promise<Result>, env: NciCtsDataEnv, toolName: string, extra: unknown, query: unknown = {}): Promise<Result> {
  try {
    const original: Result = await work().catch(error => {
      return requestFailure(error);
    });
    let structured = original.structuredContent ?? { success: original.isError !== true };
    const meta = record(structured._meta) ? structured._meta : {};
    const existing: Completeness | undefined = record(meta.completeness) && typeof meta.completeness.complete === "boolean"
      ? { ...meta.completeness, complete: meta.completeness.complete } : undefined;
    const completeness = mergeCompleteness(existing, nciCtsCompleteness(structured));
    if (completeness) structured = { ...structured, _meta: { ...meta, completeness },
      ...(record(structured._staging) ? { _staging: { ...structured._staging, completeness } } : {}) };
    const apiError = record(structured.data) && structured.data.__api_error === true;
    const failed = original.isError === true || structured.success === false || apiError || Boolean(structured.program_error) || structured.disposition === "partial";
    const result = { ...original, structuredContent: await cite(failed ? { ...structured, success: false } : structured, toolName, query), ...(failed ? { isError: true } : {}) };
    if (!shouldStage(bytes(result) + TRANSPORT_METADATA_RESERVE)) return result;
    return await stageResponse(env, result, toolName, extra, query, completeness, failed);
  } catch {
    const message = "NCI CTS source response could not be returned.";
    const data = { success: false, error: { code: "RESPONSE_ERROR", message } };
    const citation = await buildCitation({ source: NCI_CTS_SOURCE, server: "nci_cts", tool: toolName.replace(/^mcp_/, ""),
      query, queryScope: "tool_arguments", retrievedAt: new Date().toISOString(), result: data, resultScope: "structured_content:root_without_meta" });
    return { content: [{ type: "text", text: message }], structuredContent: { ...data, _meta: { citation } }, isError: true };
  }
}

function requestFailure(error: unknown) : Result {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  const message = status && error instanceof Error ? error.message.slice(0, 500) : "NCI CTS source response could not be returned.";
  return {
    content: [{ type: "text" as const, text: message }], isError: true,
    structuredContent: {
      success: false, error: { code: status ? "API_ERROR" : "RESPONSE_ERROR", message, status },
      ...(error && typeof error === "object" && "data" in error ? { data: error.data } : {})
    }
  };
}

async function stageResponse(env: NciCtsDataEnv, result: Result & { structuredContent: Record<string, unknown> }, toolName: string, extra: unknown, query: unknown, completeness: Completeness | undefined, failed: unknown) : Promise<Result> {
  if (!env.NCI_CTS_DATA_DO) throw new Error("Missing staging storage");
  const staged = await stageToDoAndRespond(result, env.NCI_CTS_DATA_DO as Parameters<typeof stageToDoAndRespond>[1], "nci_cts", undefined,
    { toolName, serverName: "nci_cts" }, "nci_cts", extra as Parameters<typeof stageToDoAndRespond>[6]);
  const citation = await buildCitation({
    source: sourceFor(result.structuredContent), server: "nci_cts", tool: toolName.replace(/^mcp_/, ""),
    query, queryScope: "tool_arguments", retrievedAt: new Date().toISOString(), result, resultScope: "staged:full_result", dataAccessId: staged.dataAccessId
  });
  const combined = mergeCompleteness(completeness, staged._staging.completeness);
  const structuredContent = {
    success: !failed, staged: true, data: undefined, data_access_id: staged.dataAccessId,
    _staging: { ...staged._staging, ...(combined ? { completeness: combined } : {}) }, _meta: { citation, ...(combined ? { completeness: combined } : {}) }
  };
  if (bytes(structuredContent) > 100000) throw new Error("Staging metadata exceeds transport limit");
  return { content: [{ type: "text", text: "Response staged. Use nci_cts_query_data; payloads retains the complete original response." }], structuredContent, ...(failed ? { isError: true } : {}) };
}
