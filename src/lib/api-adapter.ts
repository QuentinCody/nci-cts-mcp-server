import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { nciCtsRead } from "./http";

export function createNciCtsApiFetch(env?: {NCI_API_KEY?: string}): ApiFetchFn {
  return async request => {
    const source = await nciCtsRead(request, {apiKey: env?.NCI_API_KEY});
    const rows = Array.isArray(source.data) ? source.data : [source.data.trials, source.data.data].find(Array.isArray);
    const completeness = {complete: false, ...(Array.isArray(rows) ? {returned: rows.length} : {}),
      truncation: {reason: "unknown" as const, detail: "One NCI CTS response does not establish exhaustive vocabulary, trial coverage or an atomic snapshot; trial search is not an eligibility determination."}};
    const metadata = {completeness, provenance: source.provenance};
    return {status: source.status, completeness, upstreamTotal: null,
      data: Array.isArray(source.data) ? {data: source.data, _mcp: {...metadata, native_root: "array"}}
        : {...source.data, _mcp: metadata}};
  };
}
