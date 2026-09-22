import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";

export class SqlServerAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "SQLSERVER" as const;
}
