import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { priorTherapyVocabularyWorkflow, priorTherapyWorkflow } from "./prior-therapy";

export const nciCtsCatalog: ApiCatalog = {
    name: "NCI Clinical Trials Search API",
    baseUrl: "https://clinicaltrialsapi.cancer.gov/api/v2",
    version: "2.0",
    auth: "required",
    endpointCount: 8,
    workflows: [priorTherapyVocabularyWorkflow, priorTherapyWorkflow],
    notes:
        "- All endpoints require X-API-KEY header (set via NCI_API_KEY env var)\n" +
        "- Trial search (POST /trials) uses structured JSON body with NCI Thesaurus concept IDs\n" +
        "- Disease taxonomy: maintype → subtype → stage → finding (each has nci_thesaurus_concept_id)\n" +
        "- Biomarker coverage is unverified: NCI's public API overview (updated 2025-03-25) excludes biomarker data, while older API descriptions mention it. Confirm current authenticated schema and returned fields before using /biomarkers or biomarker filters; do not interpret missing fields as negative evidence.\n" +
        "- Trial status values: Active, Approved, Enrolling by Invitation, In Review, Temporarily Closed to Accrual\n" +
        "- Site recruitment_status: active, approved, enrolling_by_invitation, in_review, temporarily_closed_to_accrual\n" +
        "- Trial filter phase.phase values: i, ii, iii, iv, i_ii, ii_iii\n" +
        "- Trial filter primary_purpose.primary_purpose_code values: treatment, prevention, supportive_care, diagnostic, screening, basic_science, health_services_research, other\n" +
        "- Geo search: sites.org_coordinates_lat, sites.org_coordinates_lon, sites.org_coordinates_dist (e.g. '100mi')\n" +
        "- Pagination: from (offset), size (page size, default 10)\n" +
        "- Field projection: include (array of field names to return)\n" +
        "- Staged trials/trial_detail and vocabulary tables retain ordered mcp_source_index/mcp_native_json records. mcp_prior_therapy_json and mcp_eligibility_json keep structured/narrative evidence separate; mcp_codes_json retains every vocabulary code. SQL NULL means absent, JSON text null means explicitly null.\n" +
        "- Source JSON, original-byte hashes and request context survive staging with credential redaction. One page/detail is not complete vocabulary/history or an atomic snapshot. Native root arrays are retained under data with _mcp.native_root=array.\n" +
        "- This API exposes publicly available CTRP cancer-trial information; it is not a complete ClinicalTrials.gov mirror. Discover counts from the response, not a fixed catalog estimate.\n" +
        "- Prior-therapy beta filters are documented in NCI's public client: prior_therapy.nci_thesaurus_concept_id (array), prior_therapy.eligibility_criterion (exclusion in the client), prior_therapy.inclusion_indicator (TRIAL/TREE/DESCENDANT array). This exclusion-negation pattern retrieves candidates, not proven eligible patients. Structured annotations can differ from narrative eligibility; live deployed acceptance is pending. Do not substitute arms.interventions filters.\n" +
        "- Search results identify candidate trials; they do not establish a patient's eligibility. Current contract: https://clinicaltrialsapi.cancer.gov; public scope: https://www.cancer.gov/syndication/api",
    endpoints: [
        {
            method: "POST",
            path: "/trials",
            summary: "Search clinical trials with structured disease, intervention, location and eligibility filters. Biomarker and prior-therapy filter support requires current authenticated schema validation.",
            category: "trials",
            queryParams: [],
            body: {
                contentType: "application/json",
                description:
                    "POST JSON body with structured filters. Key fields: " +
                    "current_trial_status (array of strings), maintype (array of NCIt concept IDs e.g. ['C4872']), " +
                    "subtype (array), stage (array), finding (array), " +
                    "arms.interventions.nci_thesaurus_concept_id (array), " +
                    "keyword (string), primary_purpose.primary_purpose_code (array: treatment|prevention|diagnostic|screening|supportive_care|basic_science), " +
                    "phase.phase (array: i|ii|iii|iv|i_ii|ii_iii), " +
                    "prior_therapy.nci_thesaurus_concept_id (NCIt array), prior_therapy.eligibility_criterion ('exclusion' in the beta client pattern), prior_therapy.inclusion_indicator (array: TRIAL|TREE|DESCENDANT); prior therapy stays separate from arms.interventions, " +
                    "eligibility.structured.min_age_in_years_lte (number), eligibility.structured.max_age_in_years_gte (number), " +
                    "sites.org_coordinates_lat + sites.org_coordinates_lon + sites.org_coordinates_dist (e.g. '100mi'), " +
                    "sites.recruitment_status (array: active|approved|enrolling_by_invitation), " +
                    "sites.org_name._fulltext (string), principal_investigator._fulltext (string), lead_org._fulltext (string), " +
                    "from (number offset), size (number page size), include (array of field names to return)",
            },
        },
        {
            method: "GET",
            path: "/trials/{id}",
            summary: "Get a trial by NCI ID (e.g. NCI-2020-08118) or NCT ID (e.g. NCT04592692). Preserve the native trial, eligibility, sites and arms returned by the provider; biomarker coverage is unverified.",
            category: "trials",
            pathParams: [
                { name: "id", type: "string", required: true, description: "NCI ID (e.g. NCI-2020-08118) or NCT ID (e.g. NCT04592692)" },
            ],
        },
        {
            method: "GET",
            path: "/diseases",
            summary: "Browse/search the NCI disease taxonomy. Filter by type (maintype, subtype, stage, finding) and ancestor_ids for hierarchy navigation.",
            category: "vocabulary",
            queryParams: [
                { name: "name", type: "string", required: false, description: "Disease name search (partial match)" },
                { name: "type", type: "string", required: false, description: "Disease type filter", enum: ["maintype", "subtype", "stage", "finding"] },
                { name: "ancestor_ids", type: "string", required: false, description: "Filter by ancestor NCI Thesaurus concept ID" },
                { name: "code", type: "string", required: false, description: "NCI Thesaurus concept ID" },
                { name: "current_trial_status", type: "string", required: false, description: "Only diseases with trials in this status" },
                { name: "size", type: "number", required: false, description: "Results per page" },
                { name: "from", type: "number", required: false, description: "Offset for pagination" },
            ],
        },
        {
            method: "GET",
            path: "/interventions",
            summary: "Browse/search intervention vocabulary for drug, treatment and beta prior-therapy concept discovery. Preserve native candidates and all returned codes.",
            description: "NCI's prior-therapy client queries categories Agent, Agent Category and Other with size 10 and sort 'count desc' after three input characters. Activity-class coverage remains unverified. Suggestions require explicit review before trial filtering; do not select the first match automatically or treat missing suggestions as negative evidence.",
            category: "vocabulary",
            queryParams: [
                { name: "name", type: "string", required: false, description: "Intervention name search" },
                { name: "category", type: "array", required: false, description: "Repeated category values; a single string is also accepted by the adapter. NCI's prior-therapy client uses ['Agent', 'Agent Category', 'Other']." },
                { name: "type", type: "string", required: false, description: "Type filter" },
                { name: "code", type: "string", required: false, description: "NCI Thesaurus concept ID" },
                { name: "current_trial_status", type: "string", required: false, description: "Only interventions with trials in this status" },
                { name: "sort", type: "string", required: false, description: "NCI's prior-therapy autocomplete uses 'count desc'. Counts describe vocabulary results, not confirmed patient eligibility." },
                { name: "size", type: "number", required: false, description: "Results per page" },
                { name: "from", type: "number", required: false, description: "Offset for pagination" },
            ],
        },
        {
            method: "GET",
            path: "/biomarkers",
            summary: "Existing biomarker vocabulary route; current availability and field semantics are unverified. Check the authenticated provider schema before relying on this operation.",
            description: "Retained for compatibility, not asserted to be retired. NCI's public scope overview conflicts with earlier biomarker documentation. Neither vocabulary presence nor an empty response establishes trial-level biomarker eligibility coverage.",
            category: "vocabulary",
            queryParams: [
                { name: "name", type: "string", required: false, description: "Biomarker name search" },
                { name: "code", type: "string", required: false, description: "NCI Thesaurus concept ID" },
                { name: "eligibility_criterion", type: "string", required: false, description: "Filter by inclusion or exclusion" },
                { name: "size", type: "number", required: false, description: "Results per page" },
                { name: "from", type: "number", required: false, description: "Offset for pagination" },
            ],
        },
        {
            method: "GET",
            path: "/organizations",
            summary: "Search organizations (hospitals, cancer centers) by name. Returns org_name, org_city, org_state_or_province, org_country.",
            category: "vocabulary",
            queryParams: [
                { name: "name", type: "string", required: false, description: "Organization name search" },
                { name: "size", type: "number", required: false, description: "Results per page" },
                { name: "from", type: "number", required: false, description: "Offset for pagination" },
            ],
        },
        {
            method: "GET",
            path: "/terms",
            summary: "Search generic terms by type (lead_org, principal_investigator, sites.org_country, etc.). Useful for autocomplete and filtering.",
            category: "vocabulary",
            queryParams: [
                { name: "term_type", type: "string", required: true, description: "Term type to search (e.g. lead_org, principal_investigator, sites.org_country)" },
                { name: "term", type: "string", required: false, description: "Search string" },
                { name: "size", type: "number", required: false, description: "Results per page" },
                { name: "from", type: "number", required: false, description: "Offset for pagination" },
            ],
        },
        {
            method: "GET",
            path: "/countries",
            summary: "List all countries with trial sites. Returns country names for location filtering.",
            category: "vocabulary",
        },
    ],
};
