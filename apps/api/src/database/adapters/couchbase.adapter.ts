import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";

export class CouchbaseAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "COUCHBASE" as const;
}
