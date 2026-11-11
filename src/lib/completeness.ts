import { type Completeness, mergeCompleteness } from "@bio-mcp/shared";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Preserve NCI_CTS source coverage when Code Mode composes several pages. */
export function nciCtsCompleteness(value: unknown): Completeness | undefined {
  const pending = [value]; const seen = new Set<unknown>(); let found: Completeness | undefined;
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (record(current) && record(current._mcp) && record(current._mcp.completeness) && current._mcp.completeness.complete === false) {
      found = mergeCompleteness(found, current._mcp.completeness as unknown as Completeness);
    }
    if (record(current) && current.__staged === true && record(current._staging) && record(current._staging.completeness) && current._staging.completeness.complete === false) {
      found = mergeCompleteness(found, current._staging.completeness as unknown as Completeness);
    }
    for (const child of Object.values(current)) pending.push(child);
  }
  return found;
}
