import { CompatibilityService } from "./compatibility.service.js";
import type { AnalysisEngine, DatasetCharacteristics, DatasetClassification } from "./types.js";

const engines: AnalysisEngine[] = ["POSTGRESQL", "MYSQL", "SQLSERVER", "MONGODB", "COUCHBASE", "NEO4J"];

export class RecommendationService {
  constructor(private readonly compatibility = new CompatibilityService()) {}

  recommend(classification: DatasetClassification, characteristics: DatasetCharacteristics) {
    const scores: Record<AnalysisEngine, number> = {
      POSTGRESQL: 10,
      MYSQL: 10,
      SQLSERVER: 10,
      MONGODB: 8,
      COUCHBASE: 8,
      NEO4J: 5
    };
    const reasons: string[] = [];

    if (classification === "RELATIONAL") {
      scores.POSTGRESQL += 35;
      scores.MYSQL += 30;
      scores.SQLSERVER += 25;
      scores.MONGODB += 5;
      scores.COUCHBASE += 3;
      scores.NEO4J += 2;
      reasons.push("Dataset has consistent tabular structure");
      if (characteristics.relationshipLikeFields.length > 0) {
        scores.POSTGRESQL += 15;
        scores.SQLSERVER += 10;
        scores.MYSQL += 6;
        reasons.push("Relationship-like fields favor a relational engine");
      }
      if (characteristics.fieldCount <= 12 && characteristics.relationshipLikeFields.length === 0) {
        scores.MYSQL += 8;
        reasons.push("Simple tabular structure favors MySQL");
      }
    } else if (classification === "DOCUMENT") {
      scores.MONGODB += 50;
      scores.COUCHBASE += 45;
      scores.POSTGRESQL += 18;
      scores.MYSQL += 8;
      scores.SQLSERVER += 8;
      scores.NEO4J += 5;
      reasons.push("Nested or flexible document structure detected");
      if (characteristics.arrayFields.length > 0) reasons.push("Array fields favor document storage");
    } else if (classification === "KEY_VALUE") {
      scores.COUCHBASE += 55;
      scores.MONGODB += 38;
      scores.POSTGRESQL += 18;
      scores.MYSQL += 10;
      scores.SQLSERVER += 8;
      scores.NEO4J += 4;
      reasons.push("Records have key-value characteristics");
      reasons.push("Couchbase is compatible with document and key-value access patterns");
    } else if (classification === "GRAPH") {
      scores.NEO4J += 75;
      scores.POSTGRESQL += 20;
      scores.MYSQL += 10;
      scores.SQLSERVER += 10;
      scores.MONGODB += 8;
      scores.COUCHBASE += 5;
      reasons.push("Repeated source/target relationship fields suggest graph edges");
      reasons.push("Neo4j is compatible with highly connected relationship data");
    } else {
      reasons.push("Insufficient structure was detected for a confident recommendation");
    }

    const compatibleEngines = this.compatibility.compatibleEngines(classification);
    const recommendedEngine = classification === "UNKNOWN" ? null : engines.reduce((best, engine) => scores[engine] > scores[best] ? engine : best, engines[0]!);
    return {
      scores: Object.fromEntries(engines.map((engine) => [engine, Math.min(100, scores[engine])])) as Record<AnalysisEngine, number>,
      recommendedEngine,
      compatibleEngines,
      reasons
    };
  }
}
