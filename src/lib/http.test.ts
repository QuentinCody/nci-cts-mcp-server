import { afterEach, expect, it, vi } from "vitest";
import { nciCtsRead } from "./http";
const read = (path: string, params: Record<string, unknown>, apiKey: string, opts?: {timeoutMs?: number; maxBytes?: number}) => nciCtsRead({method:"GET",path,params},{apiKey,...opts});
const apiKey = "fixture-key-not-real";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("rejects nonfinite, nested and excessive arrays without fetching", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const params of [{length: Number.NaN}, {"data[]": [Number.POSITIVE_INFINITY]}, {"data[]": Array(101).fill("price")}, {"data[]": [{}]}, {authorization: "secret"}]) {
    await expect(read("/interventions", params, apiKey)).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("preserves native HTTP-200 API errors with redacted echoes", async () => {
  const raw = JSON.stringify({error: "Invalid frequency " + apiKey, code: 400});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(raw)));
  const failure = await read("/interventions", {}, apiKey).catch(error => error);
  expect(failure).toMatchObject({status: 502, data: {upstream_http_status: 200, provenance: {redacted: true}}});
  expect(failure.data.text).toBe(raw.replace(apiKey, "[REDACTED]"));
});

it("redacts Unicode-escaped credential echoes while preserving unaffected source formatting", async () => {
  const raw = '{ "response": { "note": "\\u0066ixture-key-not-real", "label": "\\u0061" }, "request": {"params": {"api_key": "\\u0066ixture-key-not-real"}} }\r\n';
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(raw)));
  const result = await read("/interventions", {}, apiKey);
  expect(result.data).toEqual({response: {note: "[REDACTED]", label: "a"}, request: {params: {}}});
  expect(result.provenance.raw_json).toBe(raw.replaceAll("\\u0066ixture-key-not-real", "[REDACTED]"));
  expect(result.provenance.redacted).toBe(true);
});

it("retains exact UTF-8/BOM source bytes and literal query values", async () => {
  const raw = '\uFEFF{"response":{"data":[],"text":"α😀"}}\r\n';
  const bytes = new TextEncoder().encode(raw);
  const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
  }})));
  vi.stubGlobal("fetch", fetcher);
  const result = await read("/interventions", {"category":"A+B,α"}, apiKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  expect(result.provenance).toMatchObject({ raw_json: raw, response_bytes: bytes.length, redacted: false,
    response_sha256: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,"0")).join("") });
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("category")).toBe("A+B,α");
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:"manual"});
  expect(JSON.stringify(result)).not.toContain(apiKey);
});

it.each([302,401,429,503,206])("preserves bounded native HTTP %i evidence without replay", async status => {
  const text = "native failure α".repeat(3000);
  const fetcher=vi.fn().mockResolvedValue(new Response(text,{status,headers:{"retry-after":"60"}}));
  vi.stubGlobal("fetch",fetcher);
  await expect(read("/interventions",{}, apiKey)).rejects.toMatchObject({status,data:{text,retry_after:"60",provenance:{raw_json:text,response_sha256:expect.any(String)}}});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects byte fragments even with successful status",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{headers:{"content-range":"bytes 0-1/100"}})));
  await expect(read("/interventions",{}, apiKey)).rejects.toMatchObject({status:502,data:{text:"{}"}});
});

it.each([true,false])("bounds bytes with or without declared length (%s)",async declared=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("α".repeat(10),{headers:declared?{"content-length":"20"}:{}})));
  await expect(read("/interventions",{}, apiKey,{maxBytes:19})).rejects.toThrow("byte limit");
});

it("rejects malformed UTF-8",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(new Uint8Array([0xc0,0xaf]))));
  await expect(read("/interventions",{}, apiKey)).rejects.toThrow("UTF-8");
});

it.each(["headers","body"])("enforces the deadline during %s even when abort/cancel do not settle",async phase=>{
  vi.useFakeTimers(); const cancel=vi.fn(()=>new Promise<void>(()=>{}));
  const fetcher=vi.fn().mockImplementation(()=>phase==="headers"?new Promise(()=>{}):Promise.resolve(new Response(new ReadableStream({cancel}))));
  vi.stubGlobal("fetch",fetcher);
  const promise=expect(read("/interventions",{}, apiKey,{timeoutMs:50})).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(51); await promise;
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  if(phase==="body")expect(cancel).toHaveBeenCalled();
});

it("disposes a response arriving after the header deadline",async()=>{
  vi.useFakeTimers();const cancel=vi.fn();let finish:(response:Response)=>void=()=>{};
  vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve})));
  const pending=expect(read("/interventions",{}, apiKey,{timeoutMs:50})).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(51);await pending;
  finish(new Response(new ReadableStream({cancel})));await Promise.resolve();await Promise.resolve();
  expect(cancel).toHaveBeenCalled();
});

it("redacts echoed keys and preserves original-byte hash scope",async()=>{
  const secret='fixture+key/"value';const raw=JSON.stringify({error_message:"Failure α ".repeat(4000)+secret+encodeURIComponent(secret)});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(raw,{status:429})));
  const error=await read("/interventions",{}, secret).catch(error=>error);
  expect(error).toMatchObject({status:429,data:{provenance:{redacted:true,response_bytes:new TextEncoder().encode(raw).length}}});
  expect(error.data.text.length).toBeGreaterThan(30000);expect(error.data.text).toContain("[REDACTED]");
  expect(JSON.stringify(error.data)).not.toContain(encodeURIComponent(secret));
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  expect(error.data.provenance.response_sha256).toBe(Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join(""));
});
