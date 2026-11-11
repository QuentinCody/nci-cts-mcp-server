import type { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";
import { nciCtsResponse } from "../lib/tool-result";

interface QueryEnv {
    NCI_CTS_DATA_DO?: unknown;
}

export function registerQueryData(server: McpServer, env?: QueryEnv): void {
    const handler = createQueryDataHandler("NCI_CTS_DATA_DO", "nci_cts");

    for (const name of ["nci_cts_query_data", "mcp_nci_cts_query_data"]) server.registerTool(
        name,
        {
            title: "Query Staged NCI CTS Data",
            description:
                "Query staged NCI Clinical Trials Search data using SQL. Use this when responses are too large and have been staged with a data_access_id.",
            inputSchema: {
                data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
                sql: z.string().min(1).describe("SQL query to execute against the staged data"),
                limit: z.number().int().positive().max(10000).optional().describe("Maximum number of rows to return (default: 100)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: QueryEnv })?.env || {};
            return nciCtsResponse(() => handler(args as Record<string, unknown>, runtimeEnv as Record<string, unknown>), runtimeEnv, name, extra, args);
        },
    );
}
