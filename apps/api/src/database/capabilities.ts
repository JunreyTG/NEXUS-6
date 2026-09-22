import type { AnalysisEngine } from "../analysis/types.js";
import { DATABASE_ENGINES, type DatabaseEngine, type DatabaseEngineStatus, type DatabaseModel } from "./types.js";

export type EngineCapability = {
  engine: DatabaseEngine;
  displayName: string;
  databaseType: string;
  dataModels: DatabaseModel[];
  storageConcept: string;
};

export const ENGINE_CAPABILITIES: Record<DatabaseEngine, EngineCapability> = {
  MYSQL: { engine: "MYSQL", displayName: "MySQL", databaseType: "Relational", dataModels: ["RELATIONAL"], storageConcept: "tables with structured schemas" },
  POSTGRESQL: { engine: "POSTGRESQL", displayName: "PostgreSQL", databaseType: "Relational", dataModels: ["RELATIONAL"], storageConcept: "schemas and tables with complex relational support" },
  SQLSERVER: { engine: "SQLSERVER", displayName: "Microsoft SQL Server", databaseType: "Relational", dataModels: ["RELATIONAL"], storageConcept: "schemas and tables" },
  MONGODB: { engine: "MONGODB", displayName: "MongoDB", databaseType: "Document", dataModels: ["DOCUMENT"], storageConcept: "databases and collections of documents" },
  COUCHBASE: { engine: "COUCHBASE", displayName: "Couchbase", databaseType: "Document / Key-Value", dataModels: ["DOCUMENT", "KEY_VALUE"], storageConcept: "scopes and collections" },
  NEO4J: { engine: "NEO4J", displayName: "Neo4j", databaseType: "Graph", dataModels: ["GRAPH"], storageConcept: "logical graph namespaces with nodes and relationships" }
};

export function getEngineCapability(engine: DatabaseEngine): EngineCapability {
  return ENGINE_CAPABILITIES[engine];
}

export function getEngineStatuses(statuses: Partial<Record<DatabaseEngine, DatabaseEngineStatus["status"]>> = {}): DatabaseEngineStatus[] {
  return DATABASE_ENGINES.map((engine) => {
    const capability = getEngineCapability(engine);
    return { ...capability, status: statuses[engine] ?? "not_configured" };
  });
}

export function capabilitySupportsModel(engine: AnalysisEngine, model: DatabaseModel): boolean {
  return getEngineCapability(engine).dataModels.includes(model);
}
