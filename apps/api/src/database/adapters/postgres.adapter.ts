import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";

export class PostgresAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "POSTGRESQL" as const;
}
