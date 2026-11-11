# NCI CTS MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream NCI CTS API in natural language. It is part of the [Bio MCP](../../README.md) monorepo; the server roster is maintained in the [manifest](../../config/server-manifest.json).

## Connect

Configured production endpoint:

```
https://nci-cts-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "nci-cts": {
      "command": "npx",
      "args": ["mcp-remote", "https://nci-cts-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8867/mcp` (start it with `./scripts/dev-servers.sh nci-cts`):

```json
{
  "mcpServers": {
    "nci-cts-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8867/mcp"]
    }
  }
}
```

## Tools

- `nci_cts_search` — discover available API operations (Code Mode catalog search, 8 endpoints)
- `nci_cts_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `nci_cts_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `nci_cts_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.
All four tools also have `mcp_` aliases. Complete composed responses and SQL/schema
output stage above 30 KiB in UTF-8; the stored envelope retains native evidence
and its original citation. A new citation hashes the complete stored envelope.

All eight aliases also cite inline successes and errors. SQL's omitted `limit`
stays omitted in citation arguments while execution defaults to 100 rows.
Complete response envelopes stage with SDK headroom; large SQL output is retained
in `query_rows(row_index, native_json)`. Query results above the shared 98,304-byte
ceiling fail without partial rows; recover large datasets with bounded SQL pages.

## Response integrity and staged review

`NCI_API_KEY` stays in the Worker and is sent only to the fixed API origin using
`X-API-KEY`. GET reads and POST `/trials` searches make one attempt, with a
50-second header/body deadline and 4 MiB response bound. Search bodies have a
128 KiB local bound. Unsupported methods, GET bodies, POST query parameters,
credential overrides and unsafe paths fail explicitly. Redirects, byte fragments,
invalid UTF-8/JSON and native error envelopes are rejected; bounded native error
text/status and Retry-After remain available with credential echoes redacted.

Object responses keep their native fields and add `_mcp` provenance/coverage.
Native root arrays are retained under `data` with `_mcp.native_root: "array"`.
Source JSON preserves BOM, whitespace, numeric tokens and colliding native `_mcp`
fields, except for explicit credential redaction. Provenance distinguishes the
original-byte SHA-256/count from redacted text and parsed/redacted JSON hashes.
API and dataset versions remain unknown unless independently established; the
request's v2 URL does not identify a data release. Parsed numbers retain
JavaScript precision limits.

`trials`, `trial_detail` and vocabulary tables (`interventions`, `diseases`,
`biomarkers`, `organizations`, `terms`, `countries`) retain ordered
`mcp_source_index` and complete `mcp_native_json` records. Unknown shapes use
`nci_records`. Repeated IDs and record occurrences remain separate.
`mcp_prior_therapy_json` and `mcp_eligibility_json` preserve the two evidence forms;
`mcp_codes_json` and `mcp_synonyms_json` retain complete vocabulary groups. SQL
NULL means an absent field; the text `null` means explicit native null; `[]`
remains an empty array. Native JSON retains reserved/case-colliding fields that
cannot safely become SQL columns. `nci_response` retains envelope controls and
`payloads` retains the complete staged source or MCP envelope. None of these
projections infer eligibility, resolve annotation conflicts or select a code.

## Catalog qualification

The catalog retains the existing `/biomarkers` route, but its current availability and
trial-level fields need verification against the authenticated developer schema.
[NCI's public overview](https://www.cancer.gov/syndication/api), updated March 25, 2025,
excludes biomarker data; older NCI descriptions mention biomarker access. This discrepancy
does not establish that the route has been retired. Missing fields or empty results must
not be treated as negative biomarker eligibility evidence.

The API supplies public CTRP trial information, not a complete ClinicalTrials.gov mirror.
Use response counts rather than a fixed estimate. Search matches are candidate
trials, not confirmed patient eligibility.

The Code Mode catalog includes a beta prior-therapy recipe based on the
[NCI client formatter](https://github.com/NCIOCPL/clinical-trials-search-app/blob/develop/src/utilities/formatTrialSearchQueryV2.js).
It sends `prior_therapy.nci_thesaurus_concept_id`, `eligibility_criterion` under
that same prefix, and the `TRIAL`/`TREE`/`DESCENDANT` inclusion indicators in the
existing `/trials` JSON search. The client uses `exclusion` to filter candidates
by prior therapy; this is separate from `arms.interventions`. The catalog also
corrects the client-backed `phase.phase` and
`primary_purpose.primary_purpose_code` filter names.

The recipe retains structured prior therapy and narrative eligibility together.
NCI has [documented discrepancies](https://github.com/NCIOCPL/clinical-trials-search-app/issues/683)
between these forms; missing annotations cannot establish eligibility. It returns
one page and preserves staged handles. Current authenticated schema, deployed
beta semantics and live data acceptance remain pending.

The vocabulary recipe follows NCI's [prior-therapy feature specification](https://github.com/NCIOCPL/clinical-trials-search-app/issues/672):
search `/interventions` after three characters with the repeated categories
`Agent`, `Agent Category`, `Other`, sorted by `count desc`, ten results at a time.
It preserves native candidates, synonyms and complete code groups for review;
it does not automatically select a candidate or issue a trial search. The provider
has not established activity-class coverage for these categories. Missing
suggestions therefore do not establish absence of a relevant prior therapy.
Repeated concept IDs and inclusion indicators in trial filters use OR semantics;
multiple selections do not prove that every patient condition is satisfied.

## Local verification and remaining scope

The [October 6 review](../../docs/audits/2026-10-06-nci-cts-response-review.md)
records bounded transport, complete citations and actual MCP HTTP/Node SQLite
acceptance for both prior-therapy recipes, trial pages/details and the remaining
vocabulary routes. Synthetic contradictory/missing annotations test preservation,
not provider filter semantics. Local JavaScript substitutes for isolate execution.
Authenticated schema, native data, activity-class/biomarker coverage and edited
Workerd acceptance remain pending. The previously denied connected probe was not
retried or replaced with direct HTTP. No credential was acquired or deployment
performed.

## Development

```bash
./scripts/dev-servers.sh nci-cts            # run locally (port 8867)
pnpm --filter nci-cts-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from NCI Clinical Trials Search and stays under the terms of that source: US public domain (API key required).
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
