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
POST /api/datasets/upload
GET /api/datasets
GET /api/datasets/:id
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

Copy `.env.example` to `.env` for local backend development. Configure the Neon system database values when available. Do not add credentials for the six dataset databases.

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
MAX_UPLOAD_SIZE_MB=10
TEMP_UPLOAD_DIR=
TEMP_UPLOAD_RETENTION_HOURS=24
```

`EMAIL_PROVIDER=console` logs development links without sending mail and is rejected in production. Use `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and a verified `EMAIL_FROM` address in production. Verification and password-setup tokens are random one-time values; only their SHA-256 hashes are stored.

Super Admin access remains environment-only. A Super Admin can create and manage normal Admin accounts from `/admin-management`. New Admins verify their email and set an Argon2id password before they can log in. Disabled Admins cannot log in or refresh sessions.

Authenticated Admins and Super Admins can view read-only activity history at `/logs/login`, `/logs/audit`, `/logs/security`, `/logs/dataset-activity`, and `/logs/database-activity`. The API supports date, actor, action, result, text search, and pagination filters. Log metadata is sanitized before persistence and no API mutation routes exist.

Phase 6 dataset uploads support CSV, JSON, and XLSX. The API parses only basic fields and record counts, stores metadata in the system database, and keeps the uploaded file under a private generated temporary filename. `MAX_UPLOAD_SIZE_MB`, `TEMP_UPLOAD_DIR`, and `TEMP_UPLOAD_RETENTION_HOURS` control upload limits and cleanup. No dataset database adapter or remote storage is used yet.
