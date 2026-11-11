import type { WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

// Provider feature specification: NCIOCPL/clinical-trials-search-app#672, §3.
// Activity-class coverage and current authenticated acceptance remain pending.
export const priorTherapyVocabularyWorkflow: WorkflowRecipe = {
  title: "Discover candidate prior-therapy concepts",
  description: "Search the intervention vocabulary using NCI's beta prior-therapy autocomplete pattern. Use at least three characters. Review the full native candidates, synonyms and every code in the selected group before using prior_therapy.nci_thesaurus_concept_id; do not automatically select the first name or code. The category set may omit activity-class therapies. One page only; preserve staged handles. Query interventions ordered by mcp_source_index; mcp_native_json, mcp_codes_json and mcp_synonyms_json retain complete groups.",
  keywords: ["prior therapy", "vocabulary", "autocomplete", "interventions", "NCIt", "cisplatin"],
  code: `const searchText = "cisplatin";
if (searchText.trim().length < 3) throw new Error("Enter at least three characters for prior-therapy vocabulary discovery.");
const request = {name: searchText.trim(), category: ["Agent", "Agent Category", "Other"], sort: "count desc", size: 10, from: 0};
const native = await api.get("/interventions", request);
return {request, native, interpretation: {beta: true, candidate_selection_required: true, complete_result_set: false, eligibility_determination: false, note: "Review native candidates and all codes in a selected group. Activity-class coverage is unverified; absent suggestions do not mean a therapy is irrelevant or establish eligibility."}};`,
};

// Provider implementation: NCIOCPL/clinical-trials-search-app, develop,
// src/utilities/formatTrialSearchQueryV2.js. Deployment acceptance is separate.
export const priorTherapyWorkflow: WorkflowRecipe = {
  title: "Review candidate trials using beta prior-therapy filters",
  description: "Provider-client pattern for prior cisplatin therapy. Discover and review concepts through /interventions before replacing the example code. Repeated concept IDs and inclusion indicators use OR semantics, not proof that all patient conditions are satisfied. Retains structured prior therapy and narrative eligibility separately. Missing annotations, dose/time conditions and arm-specific restrictions prevent eligibility conclusions. Authenticated live acceptance remains pending; repeat pages with identical filters and an explicit from offset. Query staged trials ordered by mcp_source_index; mcp_native_json retains each complete record and mcp_prior_therapy_json/mcp_eligibility_json preserve the separate evidence fields.",
  keywords: ["prior therapy", "cisplatin", "eligibility", "beta", "candidate trials"],
  code: `const request = {
  "prior_therapy.nci_thesaurus_concept_id": ["C376"],
  "prior_therapy.eligibility_criterion": "exclusion",
  "prior_therapy.inclusion_indicator": ["TRIAL", "TREE", "DESCENDANT"],
  current_trial_status: ["Active"], from: 0, size: 10,
  include: ["nci_id", "brief_title", "prior_therapy", "eligibility"]
};
const native = await api.post("/trials", request);
return {request, native, interpretation: {beta: true, eligibility_determination: false, complete_result_set: false, note: "Candidate discovery only. Review structured prior therapy alongside narrative eligibility and trial details; missing annotations do not prove eligibility."}};`,
};
