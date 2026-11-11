import {afterEach, expect, it, vi} from "vitest";
import {nciCtsRead} from "./http";
import {createNciCtsApiFetch} from "./api-adapter";
const apiKey = "fixture-nci-key";
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});

it("keeps POST filters, projection, native fields and source tokens unchanged", async () => {
  const raw = '\uFEFF{"total":25,"trials":[{"nci_id":"001","prior_therapy":[],"eligibility":{"unstructured":[{"description":"Synthetic restriction"}]} }],"_mcp":{"native":true},"unknown":9007199254740993}\r\n';
  const fetcher = vi.fn().mockResolvedValue(new Response(raw)); vi.stubGlobal("fetch", fetcher);
  const body = {"prior_therapy.nci_thesaurus_concept_id":["C376","C1282"],"prior_therapy.eligibility_criterion":"exclusion","prior_therapy.inclusion_indicator":["TRIAL","TREE","DESCENDANT"],from:10,size:10,include:["nci_id","prior_therapy","eligibility"],"phase.phase":["ii"]};
  const result = await createNciCtsApiFetch({NCI_API_KEY:apiKey})({method:"POST",path:"/trials",body});
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://clinicaltrialsapi.cancer.gov/api/v2/trials");
  expect(init).toMatchObject({method:"POST",redirect:"manual",headers:{"X-API-KEY":apiKey,"Content-Type":"application/json"},body:JSON.stringify(body)});
  expect(result).toMatchObject({upstreamTotal:null,completeness:{complete:false,returned:1},data:{trials:JSON.parse(raw.trim()).trials,_mcp:{provenance:{raw_json:raw,api_version:null,request:{method:"POST",path:"/trials",body}}}}});
  expect(JSON.stringify(result)).not.toContain(apiKey);
});
it.each(["headers","body"])("bounds POST searches during %s without retrying or hanging on cancellation",async phase=>{
  vi.useFakeTimers(); const cancel=vi.fn(()=>new Promise<void>(()=>{}));
  const fetcher=vi.fn().mockImplementation(()=>phase==="headers"?new Promise(()=>{}):Promise.resolve(new Response(new ReadableStream({cancel}))));
  vi.stubGlobal("fetch",fetcher);
  const pending=expect(nciCtsRead({method:"POST",path:"/trials",body:{}},{apiKey,timeoutMs:50})).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(51); await pending;
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  if(phase==="body")expect(cancel).toHaveBeenCalled();
});
it("does not replay a rejected POST search and retains Retry-After and complete native error text",async()=>{
  const text="Synthetic refusal α ".repeat(3000);
  const fetcher=vi.fn().mockResolvedValue(new Response(text,{status:429,headers:{"retry-after":"60"}}));vi.stubGlobal("fetch",fetcher);
  await expect(nciCtsRead({method:"POST",path:"/trials",body:{}},{apiKey})).rejects.toMatchObject({status:429,data:{text,retry_after:"60",provenance:{request:{method:"POST",body:{}}}}});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  {method:"DELETE",path:"/trials"}, {method:"POST",path:"/interventions"}, {method:"GET",path:"/terms",body:{}},
  {method:"POST",path:"/trials",params:{size:10},body:{}}, {method:"GET",path:"https://evil.test/interventions"},
  {method:"GET",path:"/trials/../interventions"}, {method:"GET",path:"/trials/id?api_key=secret"},
  {method:"POST",path:"/trials",body:[]}, {method:"POST",path:"/trials",body:{nested:{authorization:"secret"}}},
  {method:"POST",path:"/trials",body:{size:Number.POSITIVE_INFINITY}}, {method:"POST",path:"/trials",body:{keyword:"α".repeat(70000)}}
])("rejects unsupported or unsafe request %# before sending",async request=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  await expect(nciCtsRead(request,{apiKey})).rejects.toMatchObject({status:400});expect(fetcher).not.toHaveBeenCalled();
});
it("requires a per-adapter key and never reuses another adapter's credential",async()=>{
  const fetcher=vi.fn().mockImplementation(()=>Response.json({data:[]}));vi.stubGlobal("fetch",fetcher);
  const request={method:"GET",path:"/interventions"};
  await expect(createNciCtsApiFetch()(request)).rejects.toMatchObject({status:401});expect(fetcher).not.toHaveBeenCalled();
  await createNciCtsApiFetch({NCI_API_KEY:apiKey})(request);
  await createNciCtsApiFetch({NCI_API_KEY:"second-fixture"})(request);
  expect(fetcher.mock.calls.map(call=>new Headers(call[1].headers).get("X-API-KEY"))).toEqual([apiKey,"second-fixture"]);
});
it("preserves native arrays under data with an explicit root-shape marker",async()=>{
  const native=["001","001",null,{unknown:true}];vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json(native)));
  expect(await createNciCtsApiFetch({NCI_API_KEY:apiKey})({method:"GET",path:"/countries"})).toMatchObject({data:{data:native,_mcp:{native_root:"array",provenance:{raw_json:JSON.stringify(native)}}},completeness:{complete:false,returned:4}});
});
it.each(["null","1","<html>error</html>"])("rejects non-object JSON and successful HTML (%s) with native evidence",async raw=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(raw)));
  await expect(nciCtsRead({method:"GET",path:"/interventions"},{apiKey})).rejects.toMatchObject({status:502,data:{text:raw}});
});
