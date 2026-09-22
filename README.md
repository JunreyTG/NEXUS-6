# NEXUS-6

NEXUS-6 is a unified multi-database dataset management and intelligent storage routing system.

## Architecture Overview

The project is organized as:

- `apps/api`: Node.js, Express, TypeScript backend REST API.
- `apps/web`: React, Vite, and Tailwind CSS frontend.
- `contracts/openapi`: Shared REST API contract documentation.

The frontend communicates with the backend through REST only. It must not connect directly to Neon or to any dataset database. MongoDB, MySQL, PostgreSQL dataset storage, Couchbase, Neo4j, and SQL Server credentials are intentionally excluded until the final database integration phase.

## Backend Requirements

Required tools:

- Node.js
- npm

Phase 4 backend stack:

- Express
- TypeScript with strict mode
- Zod
- Helmet
- CORS
- express-rate-limit
- Vitest
- Supertest
- Neon PostgreSQL for the system database

Development commands:

```bash
cd apps/api
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Prisma commands:

```bash
cd apps/api
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
```

When `SYSTEM_DATABASE_DIRECT_URL` contains a valid Neon direct connection string, apply the checked-in migration with:

```bash
npx prisma migrate deploy
```

The API exposes:

```http
GET /api/health
GET /api/health/database
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET /api/auth/me
GET /api/auth/verify-email?token=...
POST /api/auth/set-password
POST /api/admins
GET /api/admins
GET /api/admins/:id
PATCH /api/admins/:id
PATCH /api/admins/:id/status
POST /api/admins/:id/resend-verification
GET /api/logs/login
GET /api/logs/audit
GET /api/logs/security
GET /api/logs/dataset-activity
GET /api/logs/database-activity
GET /api/databases/status
POST /api/datasets/upload
GET /api/datasets
GET /api/datasets/:id
POST /api/datasets/:id/analyze
GET /api/datasets/:id/analysis
POST /api/datasets/:id/storage
GET /api/datasets/:id/storage
GET /api/datasets/:id/records
GET /api/datasets/:id/records/:recordId
POST /api/datasets/:id/records
PATCH /api/datasets/:id/records/:recordId
DELETE /api/datasets/:id/records/:recordId
POST /api/reports
GET /api/reports
GET /api/reports/:id
PATCH /api/reports/:id
DELETE /api/reports/:id
POST /api/reports/:id/preview
POST /api/reports/:id/publish
POST /api/reports/:id/unpublish
PATCH /api/datasets/:id
DELETE /api/datasets/:id
```

Expected response:

```json
{
  "status": "ok",
  "service": "nexus-6-api"
}
```

## React Frontend Requirements

Required tools:

- Node.js
- npm
- TypeScript
- React Router
- TanStack Query

Development commands:

```bash
cd apps/web
npm install
npm run dev
```

Build and validation commands:

```bash
cd apps/web
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Environment

Copy `.env.example` to `.env` for local backend development. Configure the Neon system database values when available. The six dataset-database credential groups are optional, backend-only settings; never expose them to the frontend or commit real values.

`SYSTEM_DATABASE_URL` is the runtime connection used by the API. `SYSTEM_DATABASE_DIRECT_URL` is the direct Neon connection used by Prisma migration commands. Neither value is logged or returned by the API.

`LOG_DATABASE_URL` is required for log persistence and must point to a separate PostgreSQL database from both system database URLs. Log migrations use `prisma.log.config.ts` and `prisma/log-migrations`. If the log database is unavailable, primary authentication and Admin operations continue without exposing database details; log reads return a safe service-unavailable response.

The frontend defaults to `http://localhost:4000` for the API. Set `VITE_API_BASE_URL` before starting Vite if the API runs elsewhere.

```powershell
$env:VITE_API_BASE_URL = "http://localhost:4000"
npm run dev
```

The API generates its Prisma client automatically before `npm run dev` and `npm run build`. For standalone type checking after a fresh install, run `npm run prisma:generate` first.

The migrations are `prisma/migrations/20260922000000_init_system_database`, `prisma/migrations/20260922010000_authentication`, `prisma/migrations/20260922020000_admin_management`, and `prisma/migrations/20260922040000_dataset_upload_metadata`. The authentication migrations create hashed email-verification and password-setup token tables; the Phase 6 migration adds dataset file metadata. Migrations can only be applied after a valid Neon direct connection is configured.

Authentication uses `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD_HASH` without creating a super-admin row in PostgreSQL. Normal administrator sessions use the `Admin` and `AdminSession` models. Refresh tokens are stored in HttpOnly cookies as hashes in server-side session tables; access tokens are short-lived and kept in frontend memory.

Authentication and email variables:

```env
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD_HASH=
ACCESS_TOKEN_SECRET=
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
EMAIL_PROVIDER=console
EMAIL_FROM=NEXUS-6 <noreply@localhost>
RESEND_API_KEY=
VERIFICATION_TOKEN_EXPIRES_HOURS=24
PASSWORD_SETUP_TOKEN_EXPIRES_MINUTES=30
# Maximum accepted upload size in megabytes
MAX_UPLOAD_SIZE_MB=100
TEMP_UPLOAD_DIR=
TEMP_UPLOAD_RETENTION_HOURS=24
```

`EMAIL_PROVIDER=console` logs development links without sending mail and is rejected in production. Use `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and a verified `EMAIL_FROM` address in production. Verification and password-setup tokens are random one-time values; only their SHA-256 hashes are stored.

Super Admin access remains environment-only. A Super Admin can create and manage normal Admin accounts from `/admin-management`. New Admins verify their email and set an Argon2id password before they can log in. Disabled Admins cannot log in or refresh sessions.

Authenticated Admins and Super Admins can view read-only activity history at `/logs/login`, `/logs/audit`, `/logs/security`, `/logs/dataset-activity`, and `/logs/database-activity`. The API supports date, actor, action, result, text search, and pagination filters. Log metadata is sanitized before persistence and no API mutation routes exist.

Phase 6 dataset uploads support CSV, JSON, and XLSX. The API parses basic metadata, stores it in the system database, and keeps the uploaded file under a private generated temporary filename. `MAX_UPLOAD_SIZE_MB` is bounded to a maximum of 100 MB; legacy `0` values are treated as the secure 100 MB default. `TEMP_UPLOAD_DIR` may be left empty to use the private default directory, and `TEMP_UPLOAD_RETENTION_HOURS` controls cleanup.

Phase 7 adds deterministic, explainable analysis for owned datasets. Analysis profiles bounded samples for inferred types, nulls, uniqueness, identifiers, relationships, nesting, arrays, schema consistency, graph edges, and key-value patterns. Results and recommendation scores are persisted as metadata in `DatasetAnalysis`; source contents and temporary paths are never persisted or returned. The recommendation layer covers only the six planned engines and does not connect to or create any dataset database.

Phase 8 adds the common `DatabaseAdapter` contract, `DatabaseRouter`, reusable engine capabilities, safe backend-generated storage identifiers, and adapter boundaries for six engines. `GET /api/databases/status` is restricted to Super Admins and returns only engine capabilities and configured/not-configured status. The frontend exposes this information at `/databases/status` without credential fields.

Phase 9 adds the analyzed-dataset storage workflow. Admins can choose a compatible engine through `POST /api/datasets/:id/storage`; the backend validates ownership, analysis state, compatibility, and generates the storage identifier internally. The adapter is called before `DatasetLocation` is written. Engines without an implementation safely return `DATABASE_NOT_CONFIGURED` and do not create a location.

Phase 10 adds engine-neutral dataset record APIs and report management. Records and report previews route through `DatabaseRouter` and typed adapter requests; raw SQL, Cypher, Mongo commands, connection metadata, and full record contents are not accepted in report or activity-log payloads. Reports support selected fields, filters, grouping, COUNT/SUM/AVG/MIN/MAX aggregates, private/public metadata, preview, and publish/unpublish operations.

Phase 11 adds the public portal and optional six-engine environment configuration. Anonymous endpoints are available at `/api/public/datasets`, `/api/public/datasets/:id`, `/api/public/reports`, `/api/public/reports/:id`, and `/api/public/statistics`; they filter datasets and reports by `PUBLIC`, omit owner/storage internals, apply bounded pagination and search filters, and use a dedicated rate limit. Public report results are returned only when the selected adapter is available; otherwise the response contains a safe unavailable state. The frontend exposes `/`, `/about`, `/datasets`, `/datasets/:id`, `/reports`, `/reports/:id`, and `/technologies`; authenticated users retain the protected admin workspace at the dataset/report URLs.

The optional dataset environment groups are `MONGODB_URI`, `MYSQL_*`, `POSTGRES_DATA_*`, `COUCHBASE_*`, `NEO4J_*`, and `SQLSERVER_*`. Zod validation treats missing or invalid optional groups as not configured without preventing the API from starting. Configuration status does not perform a live connection test, and secrets are never returned by status or public endpoints.

All six dataset adapters remain intentionally disabled during Phase 12. Complete environment configuration is validated and reported safely, but credentials alone do not create tables, connect to engines, or fake successful storage operations.

Phase 12 hardens authentication and pre-integration boundaries. Access tokens with real server session IDs are checked against active, non-revoked sessions and active Admin state; refresh rotation and logout revocation remain server-side. Login, refresh, verification, password setup, upload, and public endpoints are rate-limited. Uploads have a bounded size, generated private filenames, strict type checks, temporary cleanup, and hardened XML/record key parsing. Metadata redaction covers connection strings, credentials, tokens, hosts, ports, URLs, and authorization values; console email delivery never prints one-time links. Production requires an explicit CORS origin, public responses omit owner/storage internals and report configuration, and database status distinguishes configured, unavailable, and not-configured engines.

Before live database integration, the remaining gaps are implementation-specific adapter threat modeling, end-to-end tests against isolated disposable database instances, operational secret rotation, and a system-settings API if runtime settings management is required. No full six-engine production integration is enabled by Phase 12.
