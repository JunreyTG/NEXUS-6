# DataVault6 Docker Database Infrastructure Guide

This document provides complete instructions for running, migrating, and maintaining the DataVault6 database environment locally using Docker.

---

## 1. Overview & Architecture

DataVault6 supports **dual deployment architectures**:

### Option A: Local Development (Host Backend + Docker Databases)
```text
Host Machine
├── DataVault6 Backend (Node.js / Express on port 4000)
│   └── Connects to localhost mapped ports
│
└── Docker Compose Network (datavault6-network)
    ├── postgres-system  (5434:5432)
    ├── postgres-logs    (5435:5432)
    ├── mysql            (3306:3306)
    ├── sqlserver        (1433:1433)
    ├── mongodb          (27017:27017)
    ├── couchbase        (8091-8096, 11210)
    └── neo4j            (7474:7474, 7687:7687)
```

### Option B: Full Containerization (Containerized Backend + Docker Databases)
```text
Docker Compose Network (datavault6-network)
├── DataVault6 API Backend Container (api:4000)
├── postgres-system  (postgres-system:5432)
├── postgres-logs    (postgres-logs:5432)
├── mysql            (mysql:3306)
├── sqlserver        (sqlserver:1433)
├── mongodb          (mongodb:27017)
├── couchbase        (couchbase:8091)
└── neo4j            (neo4j:7687)
```

---

## 2. Requirements & Docker Installation

### System Requirements
- Linux (Ubuntu 22.04/24.04), macOS, or Windows with WSL2
- Node.js 20+ / 22+ & npm
- Docker Engine & Docker Compose v2

### Quick Install on Ubuntu 24.04 LTS
If Docker is not yet installed on your host machine, install it via:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```
*(Log out and log back in for user group changes to take effect, or run `newgrp docker`)*.

Verify installation:
```bash
docker --version
docker compose version
```

---

## 3. Database Services, Ports & Named Volumes

All services use **dedicated named volumes** to ensure that restarting or taking down containers (`docker compose down`) preserves all database data.

| Service | Container Name | Image | Internal Port | Host Port | Persistent Volume |
|---|---|---|---|---|---|
| **PostgreSQL System** | `datavault6-postgres-system` | `postgres:16-alpine` | `5432` | `5434` | `datavault6-postgres-system-data` |
| **PostgreSQL Logs** | `datavault6-postgres-logs` | `postgres:16-alpine` | `5432` | `5435` | `datavault6-postgres-logs-data` |
| **MySQL** | `datavault6-mysql` | `mysql:8.4` | `3306` | `3306` | `datavault6-mysql-data` |
| **Microsoft SQL Server** | `datavault6-sqlserver` | `mcr.microsoft.com/mssql/server:2022-latest` | `1433` | `1433` | `datavault6-sqlserver-data` |
| **MongoDB** | `datavault6-mongodb` | `mongo:7.0` | `27017` | `27017` | `datavault6-mongodb-data` |
| **Couchbase** | `datavault6-couchbase` | `couchbase:community-7.6.2` | `8091`, `11210` | `8091-8096`, `11210` | `datavault6-couchbase-data` |
| **Neo4j** | `datavault6-neo4j` | `neo4j:5.20-community` | `7474`, `7687` | `7474`, `7687` | `datavault6-neo4j-data` |
| **API Backend** | `datavault6-api` | Built from `Dockerfile` | `4000` | `4000` | N/A (Stateless) |

> [!IMPORTANT]
> **PostgreSQL Port Isolation**: To avoid port collisions with host-level PostgreSQL instances (ports `5432` and `5433`), `postgres-system` binds to host port `5434` and `postgres-logs` binds to host port `5435`. Inside the Docker internal network (`datavault6-network`), both services listen on standard port `5432`.

---

## 4. Environment Variables

### Option A: Host Machine Development (`.env`)
When running `npm run dev` directly on the host machine:
```env
# Primary System Database (Docker postgres-system mapped to host 5434)
SYSTEM_DATABASE_URL=postgresql://postgres:Password123!@localhost:5434/nexus_system
SYSTEM_DATABASE_DIRECT_URL=postgresql://postgres:Password123!@localhost:5434/nexus_system

# Append-Only Activity Log Database (Docker postgres-logs mapped to host 5435)
LOG_DATABASE_URL=postgresql://postgres:Password123!@localhost:5435/nexus_logs

# Multi-Database Engines
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=nexus_db
MYSQL_USER=nexus
MYSQL_PASSWORD=Nexus6MySQL!2026

POSTGRES_DATA_HOST=localhost
POSTGRES_DATA_PORT=5432
POSTGRES_DATA_DATABASE=nexus_system
POSTGRES_DATA_USER=postgres
POSTGRES_DATA_PASSWORD=Password123!
POSTGRES_DATA_SSL=false

SQLSERVER_HOST=localhost
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=nexus6_public_data
SQLSERVER_USER=sa
SQLSERVER_PASSWORD=YourStrongPassword123!
SQLSERVER_ENCRYPT=false
SQLSERVER_TRUST_SERVER_CERTIFICATE=true

MONGODB_URI=mongodb://root:Nexus6Mongo!2026@localhost:27017/nexus-6?authSource=admin
COUCHBASE_CONNECTION_STRING=couchbase://localhost
COUCHBASE_USERNAME=nexus6
COUCHBASE_PASSWORD=Mystery@02
COUCHBASE_BUCKET=travel-sample

NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=xu698WnpSb-vy5a2ShXuSqDfkA6oVcYFq5qMxJgwGFY
```

### Option B: Docker-to-Docker Network (`.env.docker`)
When the API backend runs inside a container, services communicate through internal Docker DNS names:
```env
SYSTEM_DATABASE_URL=postgresql://postgres:Password123!@postgres-system:5432/nexus_system
SYSTEM_DATABASE_DIRECT_URL=postgresql://postgres:Password123!@postgres-system:5432/nexus_system
LOG_DATABASE_URL=postgresql://postgres:Password123!@postgres-logs:5432/nexus_logs

MYSQL_HOST=mysql
POSTGRES_DATA_HOST=postgres-system
SQLSERVER_HOST=sqlserver
MONGODB_URI=mongodb://root:Nexus6Mongo!2026@mongodb:27017/nexus-6?authSource=admin
COUCHBASE_CONNECTION_STRING=couchbase://couchbase
NEO4J_URI=bolt://neo4j:7687
```

---

## 5. Safe Neon Migration Procedure

DataVault6 includes automated utilities to backup and restore existing cloud data without risk of data loss.

### Phase 1: Backup Existing Cloud Data
Before switching database connection strings, export all system and log records:
```bash
cd apps/api
npm run db:backup:neon
```
- **Output files**:
  - `backups/neon_system_data.json` (Admins, Sessions, Datasets, Analyses, Tokens)
  - `backups/neon_logs_data.json` (Login, Audit, Security, Dataset & Database Activity logs)

### Phase 2: Start Docker Databases
```bash
# Start all database containers
docker compose up -d postgres-system postgres-logs mysql sqlserver mongodb couchbase neo4j

# Verify all containers report healthy
docker compose ps
```

### Phase 3: Apply Prisma Migrations to Docker
Once `postgres-system` and `postgres-logs` are healthy:
```bash
cd apps/api

# Apply System Database migrations
npm run prisma:migrate

# Apply Log Database migrations
npm run prisma:log:migrate
```

### Phase 4: Restore Data into Docker Databases
Load the backed-up records into Docker:
```bash
npm run db:restore:docker
```
The script restores records in topological dependency order (`Admin` -> `AdminSession` / `Tokens` -> `Dataset` -> `DatasetLocation` / `DatasetAnalysis` -> `Report`).

### Phase 5: Verify Connectivity & Integrity
```bash
npm run db:verify:docker
```

---

## 6. Daily Docker Operations

### Start All Database Containers
```bash
docker compose up -d
```

### Check Running Status & Health
```bash
docker compose ps
```

### View Real-time Container Logs
```bash
docker compose logs -f
```

### Stop Database Services (Preserves All Data)
```bash
docker compose stop
```

### Restart Database Services
```bash
docker compose restart
```

### Remove Containers (Preserves Persistent Named Volumes)
```bash
docker compose down
```

> [!CAUTION]
> **NEVER run `docker compose down -v`** in standard workflows. The `-v` flag deletes all persistent named volumes and permanently removes your database records.

---

## 7. Testing & Verification

Run the complete 16-suite test battery:
```bash
cd apps/api
npm test
```
- All **16 test files** (100 automated tests) validate:
  - Authentication & Super Admin validation
  - Admin management & token handling
  - Multi-format dataset parsing (`CSV`, `TSV`, `JSON`, `NDJSON`, `XML`, `XLSX`)
  - Profiling & engine recommendation
  - Storage routing across 6 database engines
  - Generic record CRUD & sanitization
  - Report configuration, aggregation & publishing
  - Public portal endpoints & rate-limiting
  - Sanitized activity logging

---

## 8. Health Check Verification Endpoints

When the API server is active on `http://localhost:4000`:
- **API Liveness Probe**:
  ```bash
  curl -s http://localhost:4000/api/health
  # Expected: {"status":"ok","service":"nexus-6-api"}
  ```
- **Database Health Probe**:
  ```bash
  curl -s http://localhost:4000/api/health/database
  # Expected: {"status":"ok","database":"system"}
  ```
- **Database Engine Statuses (Super Admin)**:
  ```bash
  curl -s -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" http://localhost:4000/api/databases/status
  ```
