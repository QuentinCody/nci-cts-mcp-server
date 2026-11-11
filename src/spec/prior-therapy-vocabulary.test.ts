import { afterEach, expect, it, vi } from "vitest";
import { createNciCtsApiFetch } from "../lib/api-adapter";
import { priorTherapyVocabularyWorkflow } from "./prior-therapy";

afterEach(() => vi.unstubAllGlobals());

function run(api: unknown, code = priorTherapyVocabularyWorkflow.code) {
  return new Function("api", `return (async () => {${code}})();`)(api);
}

it("uses repeated categories and preserves full candidate groups without selecting a trial filter", async () => {
  const native = { total: 22, data: [{ name: "Synthetic family", codes: ["C376", "C1282"], category: ["Agent Category"], synonyms: ["fixture synonym"], count: 0, extra: { value: "0001" } }] };
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json(native));
  vi.stubGlobal("fetch", fetcher);
  const adapter = createNciCtsApiFetch({ NCI_API_KEY: "fixture-key" });
  const result = await run({ get: async (path: string, params: Record<string, unknown>) => (await adapter({ method: "GET", path, params })).data });

  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0];
  const request = new URL(String(url));
  expect(request.origin + request.pathname).toBe("https://clinicaltrialsapi.cancer.gov/api/v2/interventions");
  expect(request.searchParams.getAll("category")).toEqual(["Agent", "Agent Category", "Other"]);
  expect(request.searchParams.get("name")).toBe("cisplatin");
  expect(request.searchParams.get("sort")).toBe("count desc");
  expect(request.searchParams.get("size")).toBe("10");
  expect(request.searchParams.get("from")).toBe("0");
  expect(new Headers(init?.headers).get("X-API-KEY")).toBe("fixture-key");
  expect(result.native).toEqual({...native, _mcp: expect.objectContaining({completeness: expect.objectContaining({complete: false}), provenance: expect.objectContaining({raw_json: JSON.stringify(native)})})});
  expect(result.interpretation).toMatchObject({ beta: true, candidate_selection_required: true, complete_result_set: false, eligibility_determination: false });
  expect(result.request).not.toHaveProperty("prior_therapy.nci_thesaurus_concept_id");
});

it("retains staged vocabulary handles without assuming a native candidate shape", async () => {
  const native = { __staged: true, data_access_id: "fixture", _staging: { tables: ["candidates"] } };
  const result = await run({ get: async () => native });
  expect(result.native).toBe(native);
  expect(result.interpretation.candidate_selection_required).toBe(true);
});

it("propagates a rejected vocabulary query without falling back to trial search", async () => {
  const fetcher = vi.fn(async () => new Response("unsupported vocabulary query", { status: 400 }));
  vi.stubGlobal("fetch", fetcher);
  const adapter = createNciCtsApiFetch({NCI_API_KEY: "fixture-key"});
  await expect(run({ get: async (path: string, params: Record<string, unknown>) => (await adapter({ method: "GET", path, params })).data })).rejects.toMatchObject({status: 400, data: {text: "unsupported vocabulary query"}});
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(["  ", "ab"])("requires three characters before issuing a lookup for %j", async searchText => {
  const get = vi.fn();
  const code = priorTherapyVocabularyWorkflow.code.replace('const searchText = "cisplatin";', `const searchText = ${JSON.stringify(searchText)};`);
  await expect(run({ get }, code)).rejects.toThrow("at least three characters");
  expect(get).not.toHaveBeenCalled();
});
