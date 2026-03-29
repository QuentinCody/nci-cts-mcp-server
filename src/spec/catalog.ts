import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const nciCtsCatalog: ApiCatalog = {
    name: "NCI Clinical Trials Search API",
    baseUrl: "https://clinicaltrialsapi.cancer.gov/api/v2",
    version: "2.0",
    auth: "required",
    endpointCount: 8,
    notes:
        "- All endpoints require X-API-KEY header (set via NCI_API_KEY env var)\n" +
        "- Trial search (POST /trials) uses structured JSON body with NCI Thesaurus concept IDs\n" +
        "- Disease taxonomy: maintype → subtype → stage → finding (each has nci_thesaurus_concept_id)\n" +
        "- Biomarkers are structured: each has nci_thesaurus_concept_id, eligibility_criterion (inclusion/exclusion)\n" +
        "- Trial status values: Active, Approved, Enrolling by Invitation, In Review, Temporarily Closed to Accrual\n" +
        "- Site recruitment_status: active, approved, enrolling_by_invitation, in_review, temporarily_closed_to_accrual\n" +
        "- Phase values: i, ii, iii, iv, i_ii, ii_iii\n" +
        "- primary_purpose values: treatment, prevention, supportive_care, diagnostic, screening, basic_science, health_services_research, other\n" +
        "- Geo search: sites.org_coordinates_lat, sites.org_coordinates_lon, sites.org_coordinates_dist (e.g. '100mi')\n" +
        "- Pagination: from (offset), size (page size, default 10)\n" +
        "- Field projection: include (array of field names to return)\n" +
        "- This API covers NCI-supported cancer trials only (~30K), not all ClinicalTrials.gov trials",
    endpoints: [
        {
            method: "POST",
            path: "/trials",
            summary: "Search clinical trials with structured filters (disease, biomarker, intervention, location, eligibility). Primary search endpoint.",
            category: "trials",
            queryParams: [],
            body: {
                contentType: "application/json",
                description:
                    "POST JSON body with structured filters. Key fields: " +
                    "current_trial_status (array of strings), maintype (array of NCIt concept IDs e.g. ['C4872']), " +
                    "subtype (array), stage (array), finding (array), " +
                    "arms.interventions.nci_thesaurus_concept_id (array), " +
                    "keyword (string), primary_purpose (array: treatment|prevention|diagnostic|screening|supportive_care|basic_science), " +
                    "phase (array: i|ii|iii|iv|i_ii|ii_iii), " +
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
            summary: "Get a single trial by NCI ID (e.g. NCI-2020-08118) or NCT ID (e.g. NCT04592692). Returns full trial with biomarkers, eligibility, sites, arms.",
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
            summary: "Browse/search intervention vocabulary. Each intervention has an NCI Thesaurus concept ID, name, category, and type.",
            category: "vocabulary",
            queryParams: [
                { name: "name", type: "string", required: false, description: "Intervention name search" },
                { name: "category", type: "string", required: false, description: "Category filter (e.g. agent, agent category)" },
                { name: "type", type: "string", required: false, description: "Type filter" },
                { name: "code", type: "string", required: false, description: "NCI Thesaurus concept ID" },
                { name: "current_trial_status", type: "string", required: false, description: "Only interventions with trials in this status" },
                { name: "size", type: "number", required: false, description: "Results per page" },
                { name: "from", type: "number", required: false, description: "Offset for pagination" },
            ],
        },
        {
            method: "GET",
            path: "/biomarkers",
            summary: "Browse/search biomarker vocabulary. Each biomarker has NCI Thesaurus concept ID, name, eligibility_criterion, assay_purpose.",
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
