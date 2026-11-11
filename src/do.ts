import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const evidenceFields = ["prior_therapy", "eligibility", "codes", "synonyms"];
function unwrap(value: unknown): unknown {
  return record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
    ? value.structuredContent.data : value;
}
function source(value: unknown) {
  const data = unwrap(value);
  // Shared staging sends serialized evidence through /process before materializing rows.
  // Leave it to the base class's payloads path instead of inventing a record table.
  if (!record(data) && !Array.isArray(data)) return undefined;
  const meta = record(data) && record(data._mcp) ? data._mcp : {};
  const provenance = record(meta.provenance) ? meta.provenance : {};
  const path = record(provenance.request) ? provenance.request.path : undefined;
  let native = data;
  if (typeof provenance.raw_json === "string") {
    try { native = JSON.parse(provenance.raw_json.replace(/^\uFEFF/, "")); } catch { /* Retain the complete payload even for non-source composed values. */ }
  }
  let collection: string | undefined;
  if (record(native)) collection = ["trials", "data"].find(key => Array.isArray(native[key]));
  const rows = Array.isArray(native) ? native : collection && record(native) ? native[collection] as unknown[] : [native];
  const sample = record(rows[0]) ? rows[0] : {};
  const resource = typeof path === "string" ? path.split("/")[1] : undefined;
  let table = resource && ["diseases", "interventions", "biomarkers", "organizations", "terms", "countries"].includes(resource) ? resource : "nci_records";
  if (resource === "trials" || collection === "trials" || "nci_id" in sample || "nct_id" in sample) table = collection || Array.isArray(native) ? "trials" : "trial_detail";
  else if (!resource && "nci_thesaurus_concept_id" in sample) {
    if ("eligibility_criterion" in sample) table = "biomarkers";
    else if ("category" in sample) table = "interventions";
    else if ("type" in sample) table = "diseases";
  }
  return {native, collection, rows, table};
}

function nativeRows(rows: unknown[]) {
  const reserved = ["_rowid", "mcp_source_index", "mcp_native_json", ...evidenceFields.map(field => "mcp_" + field + "_json")];
  const names = new Map(reserved.map(name => [name, name]));
  return rows.map((native, mcp_source_index) => {
    const row: Record<string, unknown> = {mcp_source_index, mcp_native_json: JSON.stringify(native)};
    for (const field of evidenceFields) row["mcp_" + field + "_json"] = record(native) && Object.prototype.hasOwnProperty.call(native, field) ? JSON.stringify(native[field]) : null;
    for (const [key, value] of Object.entries(record(native) ? native : {})) {
      const lower = key.toLowerCase();
      if (value !== null && typeof value === "object" || reserved.includes(lower) || names.has(lower) && names.get(lower) !== key) continue;
      names.set(lower, key); row[key] = value;
    }
    return row;
  });
}

export class NciCtsDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    const data = unwrap(value);
    if (record(data) && typeof data.sql === "string" && Array.isArray(data.rows)) {
      return {query_rows: data.rows.map((native, row_index) => ({row_index, native_json: JSON.stringify(native)}))};
    }
    const found = source(data);
    if (!found) return data;
    const controls = record(found.native) && found.collection ? {...found.native} : {};
    if (found.collection) delete controls[found.collection];
    return {[found.table]: nativeRows(found.rows), nci_response: [{response_index: 0, collection: found.collection ?? null, native_json: JSON.stringify(controls)}]};
  }

  protected getSchemaHints(value: unknown): SchemaHints | undefined {
    const found = source(value);
    if (!found) return undefined;
    const columnTypes: Record<string, string> = {mcp_native_json: "TEXT", native_json: "TEXT", collection: "TEXT"};
    for (const row of found.rows) if (record(row)) for (const [key, item] of Object.entries(row)) {
      if (typeof item === "string") columnTypes[key] = "TEXT";
    }
    for (const field of evidenceFields) columnTypes["mcp_" + field + "_json"] = "TEXT";
    columnTypes.mcp_source_index = "INTEGER";
    return {columnTypes};
  }
}
