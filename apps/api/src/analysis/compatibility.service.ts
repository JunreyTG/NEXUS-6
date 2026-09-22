import { getEngineCapability } from "../database/capabilities.js";
import { DATABASE_ENGINES } from "../database/types.js";
import type { AnalysisEngine, DatasetClassification } from "./types.js";

export class CompatibilityService {
  compatibleEngines(classification: DatasetClassification): AnalysisEngine[] {
    if (classification === "UNKNOWN") return [];
    if (classification === "KEY_VALUE") return ["COUCHBASE", "MONGODB"];
    return DATABASE_ENGINES.filter((engine) => getEngineCapability(engine).dataModels.includes(classification)) as AnalysisEngine[];
  }

  isCompatible(classification: DatasetClassification, engine: AnalysisEngine): boolean {
    return this.compatibleEngines(classification).includes(engine);
  }
}
