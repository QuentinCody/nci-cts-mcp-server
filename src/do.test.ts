/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { NciCtsDataDO } from "./do";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });
async function store(data: unknown) {
  const database = new DatabaseSync(":memory:"); databases.push(database);
  let ready: Promise<unknown> = Promise.resolve();
  const exec = (sql: string, ...args: SQLInputValue[]) => {
    const rows = database.prepare(sql).all(...args);
    return { toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() };
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<unknown>) => { ready = run(); return ready; },
    storage: { sql: { exec }, transactionSync: (run: () => unknown) => {
      database.exec("BEGIN"); try { const result = run(); database.exec("COMMIT"); return result; }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    } } };
  // This test fixture implements only the Durable Object storage interfaces used here.
  const instance = new NciCtsDataDO(ctx as unknown as ConstructorParameters<typeof NciCtsDataDO>[0], {} as ConstructorParameters<typeof NciCtsDataDO>[1]);
  await ready;
  const result = await instance.fetch(new Request("https://fixture/process", { method: "POST", body: JSON.stringify({ data }) }));
  expect(await result.json()).toMatchObject({ success: true });
  return database;
}

const trials = [
 {nci_id:"NCI-001",nct_id:"NCT00000001",prior_therapy:[],eligibility:{unstructured:[{description:"Synthetic narrative restriction despite no structured annotation"}]},_rowid:7,mcp_native_json:"native collision",ID:"001",id:"second",other_ids:["001","001"]},
 {nci_id:"NCI-001",prior_therapy:null,eligibility:{structured:{min_age_in_years:"018"},unstructured:[{description:"Synthetic conflicting criterion"}]},id:"case collision"},
 {nci_id:"NCI-003",eligibility:null},
 {nci_id:"NCI-004",prior_therapy:[{nci_thesaurus_concept_id:"C376",eligibility_criterion:"exclusion",inclusion_indicator:"TRIAL",native:{keep:true}}]}
];
const candidates = [{name:"Synthetic family",codes:["C376","C1282","C376"],synonyms:["001","α"],category:["Agent Category"],count:0,mcp_codes_json:"native collision",unknown:{keep:true}},{name:"Synthetic family",codes:["C376"],synonyms:[],category:["Other"]}];
function source(native:unknown,path:string){return{...(Array.isArray(native)?{data:native}:native as object),_mcp:{provenance:{raw_json:JSON.stringify(native),request:{method:path==="/trials"?"POST":"GET",path}}}}}
it("keeps repeated trials, complete eligibility text, identifiers and empty/null/absent annotations distinct",async()=>{
 const database=await store(source({total:99,trials,warning:"page only",_mcp:{native:true}},"/trials"));
 const rows=database.prepare("SELECT mcp_source_index,mcp_native_json,mcp_prior_therapy_json,mcp_eligibility_json FROM trials ORDER BY mcp_source_index").all();
 expect(rows.map(row=>JSON.parse(String(row.mcp_native_json)))).toEqual(trials);
 expect(rows.map(row=>row.mcp_prior_therapy_json)).toEqual(["[]","null",null,JSON.stringify(trials[3].prior_therapy)]);
 expect(rows.map(row=>row.mcp_eligibility_json)).toEqual([JSON.stringify(trials[0].eligibility),JSON.stringify(trials[1].eligibility),"null",null]);
 expect(JSON.parse(String(database.prepare("SELECT native_json FROM nci_response").get()?.native_json))).toEqual({total:99,warning:"page only",_mcp:{native:true}});
});
it("retains complete vocabulary groups without selecting one code or deduplicating groups",async()=>{
 const db=await store(source({total:22,data:candidates},"/interventions"));
 const rows=db.prepare("SELECT mcp_native_json,mcp_codes_json,mcp_synonyms_json FROM interventions ORDER BY mcp_source_index").all();
 expect(rows.map(row=>JSON.parse(String(row.mcp_native_json)))).toEqual(candidates);
 expect(rows.map(row=>JSON.parse(String(row.mcp_codes_json)))).toEqual(candidates.map(row=>row.codes));
 expect(rows.map(row=>JSON.parse(String(row.mcp_synonyms_json)))).toEqual(candidates.map(row=>row.synonyms));
});
it("projects details and all vocabulary resource shapes without guessing discarded child tables",async()=>{
 const detail=await store(source(trials[0],"/trials/NCI-001"));
 expect(JSON.parse(String(detail.prepare("SELECT mcp_native_json FROM trial_detail").get()?.mcp_native_json))).toEqual(trials[0]);
 for(const table of ["diseases","biomarkers","organizations","terms","countries"]){
  const native=["001","001",null,{name:"Native fixture",nested:{keep:true}}];
  const db=await store(source(native,"/"+table));
  expect(db.prepare(`SELECT mcp_native_json FROM ${table} ORDER BY mcp_source_index`).all().map(row=>JSON.parse(String(row.mcp_native_json)))).toEqual(native);
 }
});
it("unwraps full MCP responses and preserves large SQL output with colliding native row IDs",async()=>{
 const db=await store({content:[],structuredContent:{success:true,data:source({trials},"/trials")}});
 expect(db.prepare("SELECT COUNT(*) AS n FROM trials").get()).toEqual({n:4});
 const rows=[{_rowid:7,value:"0001"},{_rowid:7,value:null}];
 const result=await store({content:[],structuredContent:{success:true,data:{rows,sql:"SELECT * FROM trials"}}});
 expect(result.prepare("SELECT native_json FROM query_rows ORDER BY row_index").all().map(row=>JSON.parse(String(row.native_json)))).toEqual(rows);
});
it("preserves the shared serialized-evidence path instead of consuming it as a native record",async()=>{
 const serialized=JSON.stringify(source({trials},"/trials"));
 const db=await store(serialized);
 const raw=String(db.prepare("SELECT root_json FROM payloads WHERE id=1").get()?.root_json);
 const decoded=JSON.parse(raw);
 expect(typeof decoded==="string"?JSON.parse(decoded):decoded).toEqual(JSON.parse(serialized));
});
