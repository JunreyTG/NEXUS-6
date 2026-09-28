# DataVault6 Centralized Activity Logging Architecture

## 1. Overview

DataVault6 implements a centralized, non-blocking, and privacy-preserving activity logging system. Every meaningful action performed by users, administrators, or anonymous public portal visitors is recorded across the backend.

The architecture preserves the existing **Log DB separation** and **five dedicated log streams**, while offering a unified semantic activity interface (`ActivityLogService`), automated HTTP request correlation and deduplication, and rich dashboard statistics.

```
                      Client Request
                            │
                            ▼
               [Request Logger Middleware]
                 ├─ Generates requestId
                 ├─ Initializes AsyncLocalStorage context
                 └─ Tracks duration & catches uncaught HTTP errors (401, 403, 429)
                            │
                            ▼
                 [Controller / Service]
                            │
                            ▼ (Semantic Action Emitted)
                 [ActivityLogService / LogService]
                 ├─ Enriches with HTTP metadata & requestId
                 ├─ Automatically redacts secrets (passwords, tokens, URIs)
                 ├─ Marks semantic log as emitted (prevents duplicates)
                 └─ Dispatches to target log model
                            │
            ┌───────────────┼───────────────┬─────────────────┬──────────────────┐
            ▼               ▼               ▼                 ▼                  ▼
       LoginLog         AuditLog      SecurityEvent   DatasetActivityLog  DatabaseActivityLog
       (Auth attempts) (Admin & Org)  (Violations)    (Datasets/CRUD/Rep) (Engines/Storage)
```

---

## 2. Activity Categories

All logs belong to one of 10 standardized categories:

| Category | Description | Primary Target Stream |
| :--- | :--- | :--- |
| `AUTHENTICATION` | User authentication, sessions, logins, logouts, token refreshes | `LoginLog` / `AuditLog` |
| `ADMINISTRATION` | Administrator onboarding, profiles, role/status changes, verification | `AuditLog` |
| `DATASET` | Dataset creation, uploads, metadata updates, visibility, deletion | `DatasetActivityLog` |
| `ANALYSIS` | Dataset schema detection, profiling, classification, recommendations | `DatasetActivityLog` |
| `DATABASE` | Engine selection, storage provisioning, connection checks, queries | `DatabaseActivityLog` |
| `RECORD` | Generic CRUD on records (create, read/query, update, delete, bulk) | `DatasetActivityLog` |
| `REPORT` | Report definition, previews, publications, queries | `DatasetActivityLog` |
| `SECURITY` | Rate limits, unauthorized requests (401), forbidden actions (403), token abuse | `SecurityEvent` |
| `SYSTEM` | System configurations, settings, internal server errors (500) | `AuditLog` |
| `PUBLIC_ACCESS` | Anonymous public portal dataset and report views | `DatasetActivityLog` |

---

## 3. Action Catalog and Stream Mapping

| Action | Category | Stream | Description |
| :--- | :--- | :--- | :--- |
| `LOGIN` / `LOGIN_ATTEMPT` | `AUTHENTICATION` | `LoginLog` | Successful or failed login attempt |
| `LOGOUT` | `AUTHENTICATION` | `AuditLog` | Session revocation / user logout |
| `TOKEN_REFRESH` | `AUTHENTICATION` | `AuditLog` | Successful refresh token consumption |
| `REFRESH_TOKEN_INVALID` | `SECURITY` | `SecurityEvent` | Invalid refresh token used |
| `REFRESH_TOKEN_REUSE` | `SECURITY` | `SecurityEvent` | Revoked refresh token replay detected |
| `PASSWORD_SETUP` | `AUTHENTICATION` | `AuditLog` | Initial admin password establishment |
| `EMAIL_VERIFIED` | `AUTHENTICATION` | `AuditLog` | Email verification token consumed |
| `USER_VIEWED` | `AUTHENTICATION` | `AuditLog` | `/api/auth/me` user profile retrieval |
| `ADMIN_CREATED` | `ADMINISTRATION` | `AuditLog` | New administrator invited / created |
| `ADMIN_UPDATED` | `ADMINISTRATION` | `AuditLog` | Administrator profile patched |
| `ADMIN_STATUS_CHANGED` | `ADMINISTRATION` | `AuditLog` | Admin enabled, disabled, or set to pending |
| `VERIFICATION_RESENT` | `ADMINISTRATION` | `AuditLog` | Admin verification email resent |
| `ADMIN_LIST_VIEWED` | `ADMINISTRATION` | `AuditLog` | Admin roster list retrieved |
| `ADMIN_VIEWED` | `ADMINISTRATION` | `AuditLog` | Specific admin profile viewed |
| `DATASET_UPLOAD_SUCCESS` | `DATASET` | `DatasetActivityLog` | Dataset file uploaded and registered |
| `DATASET_UPLOAD_FAILURE` | `DATASET` | `DatasetActivityLog` | Dataset upload rejected or validation failed |
| `DATASET_LIST_VIEWED` | `DATASET` | `DatasetActivityLog` | Dataset roster queried |
| `DATASET_VIEWED` | `DATASET` | `DatasetActivityLog` | Specific dataset metadata retrieved |
| `DATASET_METADATA_UPDATED` | `DATASET` | `DatasetActivityLog` | Dataset metadata (name, description, visibility) updated |
| `DATASET_DELETED` | `DATASET` | `DatasetActivityLog` | Dataset removed from system |
| `DATASET_ANALYSIS_STARTED` | `ANALYSIS` | `DatasetActivityLog` | Schema analysis workflow triggered |
| `DATASET_ANALYSIS_COMPLETED` | `ANALYSIS` | `DatasetActivityLog` | Analysis and classification completed |
| `DATASET_ANALYSIS_FAILED` | `ANALYSIS` | `DatasetActivityLog` | Analysis execution failed |
| `DATASET_ANALYSIS_VIEWED` | `ANALYSIS` | `DatasetActivityLog` | Existing analysis inspected |
| `ENGINE_SELECTED` | `DATABASE` | `DatabaseActivityLog` | Database engine chosen for dataset |
| `STORAGE_REQUESTED` | `DATABASE` | `DatabaseActivityLog` | Database storage provisioning requested |
| `STORAGE_CREATE_SUCCESS` | `DATABASE` | `DatabaseActivityLog` | Database storage provisioned in target engine |
| `STORAGE_CREATE_FAILED` | `DATABASE` | `DatabaseActivityLog` | Storage creation failed |
| `STORAGE_STATUS_VIEWED` | `DATABASE` | `DatabaseActivityLog` | Dataset storage configuration inspected |
| `DATABASE_STATUS_VIEWED` | `DATABASE` | `DatabaseActivityLog` | Engine health status queried |
| `RECORD_QUERIED` | `RECORD` | `DatasetActivityLog` | Record search/query executed on storage adapter |
| `RECORD_VIEWED` | `RECORD` | `DatasetActivityLog` | Specific record retrieved |
| `RECORD_CREATE` | `RECORD` | `DatasetActivityLog` | New record inserted into dataset |
| `RECORD_UPDATE` | `RECORD` | `DatasetActivityLog` | Record updated in dataset |
| `RECORD_DELETE` | `RECORD` | `DatasetActivityLog` | Record deleted from dataset |
| `REPORT_CREATE` | `REPORT` | `DatasetActivityLog` | Report configuration created |
| `REPORT_UPDATE` | `REPORT` | `DatasetActivityLog` | Report configuration updated |
| `REPORT_DELETE` | `REPORT` | `DatasetActivityLog` | Report deleted |
| `REPORT_PREVIEW` | `REPORT` | `DatasetActivityLog` | Report query plan executed for preview |
| `REPORT_PUBLISH` | `REPORT` | `DatasetActivityLog` | Report visibility set to PUBLIC |
| `REPORT_UNPUBLISH` | `REPORT` | `DatasetActivityLog` | Report visibility set to PRIVATE |
| `REPORT_LIST_VIEWED` | `REPORT` | `DatasetActivityLog` | Report list inspected |
| `REPORT_VIEWED` | `REPORT` | `DatasetActivityLog` | Report details inspected |
| `PUBLIC_DATASET_LIST_VIEWED`| `PUBLIC_ACCESS` | `DatasetActivityLog` | Anonymous public portal dataset listing |
| `PUBLIC_DATASET_VIEWED` | `PUBLIC_ACCESS` | `DatasetActivityLog` | Anonymous public portal dataset detail view |
| `PUBLIC_REPORT_LIST_VIEWED` | `PUBLIC_ACCESS` | `DatasetActivityLog` | Anonymous public portal report listing |
| `PUBLIC_REPORT_VIEWED` | `PUBLIC_ACCESS` | `DatasetActivityLog` | Anonymous public portal report preview |
| `PUBLIC_STATISTICS_VIEWED` | `PUBLIC_ACCESS` | `DatasetActivityLog` | Anonymous public portal metrics queried |
| `UNAUTHORIZED_ACCESS` | `SECURITY` | `SecurityEvent` | 401 unauthenticated request |
| `FORBIDDEN_ACCESS` | `SECURITY` | `SecurityEvent` | 403 authorization violation |
| `RATE_LIMIT_EXCEEDED` | `SECURITY` | `SecurityEvent` | 429 rate limit exceeded |

---

## 4. Log Schema and Metadata Fields

Each log record contains standard top-level fields stored in the dedicated Log Database:

* `id` (`String @db.Uuid`): Unique UUID of the log entry.
* `timestamp` (`DateTime`): UTC timestamp of the event.
* `actorType` (`SUPER_ADMIN` \| `ADMIN` \| `SYSTEM` \| `ANONYMOUS`): Classification of the principal.
* `actorId` (`String? @db.Uuid`): ID of user or admin (null for anonymous/system).
* `actorEmail` (`String?`): Email address of the actor.
* `action` (`String`): The semantic event name.
* `resourceType` (`String?`): Target entity type (`DATASET`, `ADMIN`, `REPORT`, `DATABASE`, `USER`, `ENDPOINT`).
* `resourceId` (`String? @db.Uuid`): UUID of the targeted entity.
* `success` (`Boolean`): `true` for success, `false` for failure.
* `ipAddress` (`String?`): Client IP address.
* `userAgent` (`String?`): Client browser or agent string.
* `errorCode` (`String?`): Machine-readable failure code when unsuccessful.
* `metadata` (`Json`): Enriched JSON payload containing:
  * `category`: Action category string.
  * `method`: HTTP method (`GET`, `POST`, etc.).
  * `endpoint`: Request URL path.
  * `statusCode`: HTTP response status code.
  * `durationMs`: Total request execution time.
  * `requestId`: Correlated request UUID (`X-Request-Id`).
  * `databaseEngine`: Relevant database engine name.
  * `datasetId`: Correlated dataset UUID.
  * `description`: Human-readable summary of the event.

---

## 5. Privacy and Redaction Rules

Sensitive data is automatically intercepted and redacted before storage in `sanitizeMetadata()`.

### Redacted Keys
Any metadata key matching:
* `password`, `confirmPassword`, `passwordConfirmation`, `databasePassword`
* `token`, `accessToken`, `refreshToken`, `tokenHash`, `passwordHash`
* `secret`, `apiKey`, `credential`, `authorization`, `cookie`, `privateKey`
* `connectionString`, `host`, `port`, `url`, `uri`, `dsn`

### Redacted Values
Any string value containing:
* Bearer tokens (`Bearer ...`)
* JWT tokens (`eyJ...`)
* Connection strings (`postgres://...`, `mysql://...`, `mongodb://...`, `neo4j://...`, `couchbase://...`, `sqlserver://...`)

### Protection Guards
* Prototype pollution defense: `__proto__`, `prototype`, `constructor` keys are dropped.
* Circular JSON protection: `WeakSet` tracking prevents circular references.
* Object depth and array size boundaries: Prevents oversized logs.

---

## 6. Log API Endpoints

All log retrieval endpoints require `ADMIN` or `SUPER_ADMIN` authentication.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/logs` | `GET` | Unified chronological activity feed across all streams |
| `/api/logs/statistics` | `GET` | Activity aggregations, total success/failure counts, by category, and by stream |
| `/api/logs/:id` | `GET` | Retrieve any log record by UUID across all streams |
| `/api/logs/activity` | `GET` | Alias for unified activity feed |
| `/api/logs/authentication` | `GET` | Filtered to login and authentication records |
| `/api/logs/datasets` | `GET` | Filtered to dataset lifecycle and record CRUD operations |
| `/api/logs/database` | `GET` | Filtered to database provisioning and status checks |
| `/api/logs/security` | `GET` | Security events, violations, and rate limits |
| `/api/logs/audit` | `GET` | Administrator and configuration audit records |
| `/api/logs/login` | `GET` | Existing login stream |
| `/api/logs/dataset-activity` | `GET` | Existing dataset activity stream |
| `/api/logs/database-activity` | `GET` | Existing database activity stream |

### Query and Filtering Parameters

All list endpoints support:
* `page`: Integer page number (default `1`).
* `pageSize`: Results per page (default `25`, max `100`).
* `start` / `from`: ISO 8601 start timestamp filter.
* `end` / `to`: ISO 8601 end timestamp filter.
* `actor` / `actorId`: Actor email or UUID filter.
* `action`: Event action name.
* `category`: Category string (`DATASET`, `SECURITY`, `AUTHENTICATION`, etc.).
* `resourceType`: Resource type (`DATASET`, `REPORT`, etc.).
* `resourceId` / `datasetId`: UUID of target entity.
* `databaseEngine`: Target engine (`PostgreSQL`, `MySQL`, etc.).
* `success` / `status`: Boolean or `"SUCCESS"` / `"FAILED"`.
* `search`: Free-text search across actor, action, resource type, and errorCode.
* `stream`: Stream filter (`all`, `login`, `audit`, `security`, `dataset-activity`, `database-activity`).

---

## 7. Developer Guide: Adding Logging to a New Feature

Developers should inject or use `ActivityLogService` (alias for `LogService`).

```typescript
import { ActivityLogService } from "../logging/log.service.js";

export class SampleService {
  constructor(private readonly logger = new ActivityLogService()) {}

  async doSomething(datasetId: string, user: { id: string; role: "ADMIN" | "SUPER_ADMIN"; email: string }) {
    try {
      // 1. Perform primary business logic
      const result = await performOperation(datasetId);

      // 2. Log success
      await this.logger.log({
        actorType: user.role,
        actorId: user.id,
        actorEmail: user.email,
        category: "DATASET",
        action: "DATASET_CUSTOM_ACTION",
        resourceType: "DATASET",
        resourceId: datasetId,
        datasetId,
        description: "Custom dataset operation completed successfully",
        status: "SUCCESS",
        metadata: {
          itemsProcessed: result.count
        }
      });

      return result;
    } catch (error) {
      // 3. Log failure (does not mask or swallow error)
      await this.logger.log({
        actorType: user.role,
        actorId: user.id,
        actorEmail: user.email,
        category: "DATASET",
        action: "DATASET_CUSTOM_ACTION",
        resourceType: "DATASET",
        resourceId: datasetId,
        datasetId,
        description: "Custom dataset operation failed",
        status: "FAILED",
        errorCode: error instanceof Error ? error.name : "OPERATION_FAILED"
      });

      throw error;
    }
  }
}
```

### Key Principles for Developers:
1. **Never let logging crash the application**: `ActivityLogService.logActivity` and all logging methods catch any logging failure silently.
2. **Never log secrets**: Do not pass passwords, JWTs, connection strings, or full database record row bodies.
3. **HTTP Metadata is automatic**: In HTTP request contexts, `requestId`, `method`, `endpoint`, and `durationMs` are automatically injected from `requestContextStorage`.
4. **Deduplication is automatic**: When you call `this.logger.log(...)`, the request context is marked as logged. The request logging middleware will not create a redundant duplicate record.
