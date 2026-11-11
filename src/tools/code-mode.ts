import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { nciCtsCatalog } from "../spec/catalog";
import { createNciCtsApiFetch } from "../lib/api-adapter";
import { nciCtsResponse, NCI_CTS_SOURCE } from "../lib/tool-result";

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
    const registrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        // SAFETY: shared factories supply SDK registration arguments and handlers.
        const handler = rest.pop() as (input: unknown, extra: unknown) => ReturnType<typeof nciCtsResponse>;
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
            (input: unknown, extra: unknown) => nciCtsResponse(() => handler(input, extra), env, alias, extra, input));
    } };

    const searchTool = createSearchTool({
        prefix: "nci_cts",
        catalog: nciCtsCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "nci_cts",
        // Verifiable provenance: nci_cts_execute results carry a _meta.citation.
        source: NCI_CTS_SOURCE,
        catalog: nciCtsCatalog,
        apiFetch,
        preserveApiErrors: true,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        timeout: 90_000,
        doNamespace: env.NCI_CTS_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(registrar);
}
