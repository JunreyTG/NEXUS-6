export type AnalysisEngine = "MONGODB" | "MYSQL" | "POSTGRESQL" | "COUCHBASE" | "NEO4J" | "SQLSERVER";
export type DatasetClassification = "RELATIONAL" | "DOCUMENT" | "KEY_VALUE" | "GRAPH" | "UNKNOWN";

export type FieldAnalysis = {
  name: string;
  inferredTypes: string[];
  nullCount: number;
  nullPercentage: number;
  uniqueEstimate: number;
  presencePercentage: number;
};

export type DatasetCharacteristics = {
  recordCount: number;
  analyzedRecordCount: number;
  fieldCount: number;
  fields: FieldAnalysis[];
  candidateIds: string[];
  relationshipLikeFields: string[];
  arrayFields: string[];
  nestedFields: string[];
  maxNestingDepth: number;
  schemaConsistency: number;
  nestedObjects: boolean;
  flexibleDocumentStructure: boolean;
  keyValueCharacteristics: boolean;
  graphEdgePatterns: boolean;
};

export type AnalysisResult = {
  classification: DatasetClassification;
  recommendedEngine: AnalysisEngine | null;
  scores: Record<AnalysisEngine, number>;
  compatibleEngines: AnalysisEngine[];
  reasons: string[];
  characteristics: DatasetCharacteristics;
};
