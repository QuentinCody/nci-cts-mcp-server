import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class NciCtsDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        if (Array.isArray(data)) {
            const sample = data[0];
            if (sample && typeof sample === "object") {
                // Trial search results
                if ("nci_id" in sample || "nct_id" in sample) {
                    return {
                        tableName: "trials",
                        indexes: ["nci_id", "nct_id", "brief_title", "current_trial_status", "phase"],
                        skipChildTables: ["other_ids"],
                    };
                }
                // Disease taxonomy results
                if ("nci_thesaurus_concept_id" in sample && "type" in sample) {
                    return {
                        tableName: "diseases",
                        indexes: ["nci_thesaurus_concept_id", "name", "type"],
                    };
                }
                // Intervention results
                if ("nci_thesaurus_concept_id" in sample && "category" in sample) {
                    return {
                        tableName: "interventions",
                        indexes: ["nci_thesaurus_concept_id", "name", "category"],
                    };
                }
                // Biomarker results
                if ("nci_thesaurus_concept_id" in sample && "eligibility_criterion" in sample) {
                    return {
                        tableName: "biomarkers",
                        indexes: ["nci_thesaurus_concept_id", "name", "eligibility_criterion"],
                    };
                }
            }
        }

        // Single trial object
        const obj = data as Record<string, unknown>;
        if (obj.nci_id && obj.brief_title) {
            return {
                tableName: "trial_detail",
                indexes: ["nci_id", "nct_id"],
                skipChildTables: ["other_ids"],
            };
        }

        return undefined;
    }
}
