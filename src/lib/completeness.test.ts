import { expect, it } from "vitest";
import { nciCtsCompleteness } from "./completeness";
import { nciCtsResponse } from "./tool-result";

it("preserves incomplete page coverage after comparison composes results", async () => {
  const completeness = {complete:false,returned:2,truncation:{reason:"upstream_cap" as const,detail:"top matches"}};
  const data = {pages:[{mode:"semantic",result:{count:2,results:[{id:1},{id:2}],_mcp:{completeness}}}]};
  expect(nciCtsCompleteness(data)).toEqual(completeness);
  const result = await nciCtsResponse(async()=>({content:[],structuredContent:{success:true,data}}),{},"nci_cts_execute",{});
  expect(result.structuredContent?._meta).toMatchObject({completeness});
});

it("handles large arrays and cycles without a call-stack or argument-count overflow",()=>{
  const value:unknown[] = Array(150000).fill(0);value.push(value,{_mcp:{completeness:{complete:false,truncation:{reason:"unknown"}}}});
  expect(nciCtsCompleteness(value)).toMatchObject({complete:false});
  expect(nciCtsCompleteness({native:{count:0}})).toBeUndefined();
});

it("retains coverage from nested source handles after in-band SQL comparison",()=>{
  const completeness={complete:false,returned:24,truncation:{reason:"upstream_cap",detail:"top matches"}};
  expect(nciCtsCompleteness({pages:[{result:{__staged:true,data_access_id:"source",_staging:{completeness}}}]})).toEqual(completeness);
});
