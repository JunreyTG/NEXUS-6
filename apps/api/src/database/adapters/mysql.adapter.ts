import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";

export class MySqlAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "MYSQL" as const;
}
