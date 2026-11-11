import { afterEach, expect, it, vi } from "vitest";
import { createNciCtsApiFetch } from "../lib/api-adapter";
import { priorTherapyWorkflow } from "./prior-therapy";
import { nciCtsCatalog } from "./catalog";

afterEach(() => vi.unstubAllGlobals());
const run = (api: unknown) => new Function("api", `return (async () => {${priorTherapyWorkflow.code}})();`)(api);

it("sends the provider-client prior-therapy filters and preserves both native eligibility forms", async () => {
  const native = { total: 25, trials: [{ nci_id: "fixture", prior_therapy: [], eligibility: { unstructured: [{ description: "Synthetic narrative restriction despite missing structured annotation" }] } }] };
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json(native));
  vi.stubGlobal("fetch", fetcher);
  const adapter = createNciCtsApiFetch({ NCI_API_KEY: "fixture-key" });
  const result = await run({ post: async (path: string, body: unknown) => (await adapter({ method: "POST", path, body })).data });
  expect(result).toMatchObject({ native, interpretation: { beta: true, eligibility_determination: false, complete_result_set: false } });
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://clinicaltrialsapi.cancer.gov/api/v2/trials");
  expect(init?.method).toBe("POST");
  expect(new Headers(init?.headers).get("X-API-KEY")).toBe("fixture-key");
  expect(JSON.parse(String(init?.body))).toEqual({
    "prior_therapy.nci_thesaurus_concept_id": ["C376"],
    "prior_therapy.eligibility_criterion": "exclusion",
    "prior_therapy.inclusion_indicator": ["TRIAL", "TREE", "DESCENDANT"],
    current_trial_status: ["Active"], from: 0, size: 10,
    include: ["nci_id", "brief_title", "prior_therapy", "eligibility"],
  });
  expect(result.request).not.toHaveProperty("arms.interventions.nci_thesaurus_concept_id");
});

it("preserves staged native evidence rather than replacing it with an empty trial array", async () => {
  const native = { __staged: true, data_access_id: "fixture", _staging: { tables: ["trials"] } };
  expect(await run({ post: async () => native })).toMatchObject({ native, interpretation: { eligibility_determination: false } });
});

it("propagates provider errors without falling back to intervention search", async () => {
  const post = vi.fn(async () => { throw new Error("HTTP 400: prior therapy unavailable"); });
  await expect(run({ post })).rejects.toThrow("prior therapy unavailable");
  expect(post).toHaveBeenCalledOnce();
});

it("documents the nested phase and purpose filter names used by the provider client", () => {
  const description = nciCtsCatalog.endpoints.find(endpoint => endpoint.method === "POST" && endpoint.path === "/trials")?.body?.description;
  expect(description).toContain("phase.phase (array");
  expect(description).toContain("primary_purpose.primary_purpose_code (array");
  expect(description).not.toMatch(/(?:^|\s)phase \(array:/);
  expect(description).not.toMatch(/(?:^|\s)primary_purpose \(array:/);
});
