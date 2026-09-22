import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";

export class MongoDbAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "MONGODB" as const;
}
