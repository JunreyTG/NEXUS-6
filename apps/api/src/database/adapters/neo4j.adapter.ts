import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";

export class Neo4jAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "NEO4J" as const;
}
