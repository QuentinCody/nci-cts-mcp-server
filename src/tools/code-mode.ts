import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { nciCtsCatalog } from "../spec/catalog";
import { createNciCtsApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    NCI_CTS_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
    NCI_API_KEY?: string;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createNciCtsApiFetch({ NCI_API_KEY: env.NCI_API_KEY });

    const searchTool = createSearchTool({
        prefix: "nci_cts",
        catalog: nciCtsCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "nci_cts",
        catalog: nciCtsCatalog,
        apiFetch,
        doNamespace: env.NCI_CTS_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
