# DataVault6 (NEXUS-6) — Full UI Specifications & User Guide

> **Platform Name:** DataVault6 — Centralized Dataset Collection, Multi-Engine Routing, & Activity Monitoring System  
> **Frontend Entrypoints:** `apps/web/index.html`, `apps/web/app.js`, `apps/web/style.css`  
> **Backend API Base:** `http://localhost:4000` (proxied via Vite at `http://localhost:8080/api`)

---

## 1. UI Architecture & Layout Overview

DataVault6 uses a responsive **Three-Zone Workspace Layout** gated behind a dedicated full-screen **Authentication Portal** (`#loginScreen`). Once authenticated, `#appLayout` renders:
1. **Left Navigation Sidebar (`#sidebar`):** Persistent navigation across Overview, Datasets, 6 Database Engines, Tools, and Account screens.
2. **Top Navigation Header (`.top-header`):** Global search (`Ctrl + K`), Theme Toggle, Notifications Bell, Create Admin button, and User Profile Chip.
3. **Two-Column Workspace (`.dashboard-grid`):**
   - **Center Dynamic Viewport (`.center-content`):** Switches seamlessly between the Dashboard Overview, Dedicated Database Engine Screen, Platform Analytics Screen, Data Requests Board, Administrator Profile Screen, and Platform Settings Screen.
   - **Right Operational Panel (`.right-panel`):** Houses the 6-Engine Database Center cards (with live dataset counts and storage occupied), Quick Actions, and the live Activity Feed.

### Design & Visual Specifications
| Property | Specification |
| :--- | :--- |
| **Primary Font Family** | `Plus Jakarta Sans` (weights: `400`, `500`, `600`, `700`, `800`) |
| **Monospace Font Family** | `JetBrains Mono` (weights: `400`, `500`, `600`) — used for ports, hosts, URLs, and schema types |
| **Theme Modes** | **Light Mode** & **Dark Mode** (`[data-theme="dark"]`), persisted in `localStorage` |
| **Display Density** | **Comfortable** (default) & **Compact** table row spacing |
| **Visual Effects** | Toggleable **Glassmorphism / Backdrop Blur** and **Smooth Micro-Animations** |

---

## 2. Authentication & Onboarding Screens

### 2.1 Full-Screen Login Portal (`#loginScreen`)
- **Purpose:** Restricts platform access to authenticated **Super Administrators** and **Data Administrators**.
- **UI Elements & Controls:**
  - **Email Address Input (`#loginEmailInput`):** Accepts the administrator's registered email address.
  - **Password Input (`#loginPasswordInput`) & Visibility Toggle (`#btnToggleLoginPwd`):** Argon2id-verified password field with show/hide eye icon toggle.
  - **Error Banner (`#loginErrorMsg`):** Displays authentication errors (invalid credentials, unverified `PENDING` status, or `DISABLED` account).
  - **Submit Button (`#btnSubmitLogin`):** Calls `POST /api/auth/login`, stores the JWT access token, fetches the user's profile (`GET /api/auth/me`), and transitions into `#appLayout`.

### 2.2 Verify Email & Password Setup Modal (`#setupPasswordModal`)
- **Trigger:** Automatically opens when an invited administrator visits `/verify-email?token=<TOKEN>` from their invitation email.
- **4-State Workflow:**
  1. **State 1 — Verifying Token (`#setupPasswordLoading`):** Validates the single-use verification token via `GET /api/auth/verify-email?token=...`.
  2. **State 2 — Error State (`#setupPasswordErrorState`):** Displays if the token is expired, invalid, or already consumed.
  3. **State 3 — Set Password Form (`#setupPasswordForm`):** Prompts the verified user (`#setupVerifiedEmail`) to enter and confirm a minimum 12-character password (`POST /api/auth/set-password`).
  4. **State 4 — Activation Success (`#setupPasswordSuccessState`):** Confirms account transition from `PENDING` -> `ACTIVE` and provides the **Sign In Now** (`#btnGoToLoginAfterSetup`) button.

---

## 3. Left Navigation Sidebar (`#sidebar`)

The persistent left sidebar organizes navigation into **5 functional sections**:

| Section | Navigation Item | Element ID / Selector | Function & Destination |
| :--- | :--- | :--- | :--- |
| **Overview** | **Dashboard** | `#nav-dashboard` | Returns to the main Dashboard overview (`#dashboardOverviewGroup`). |
| **DATASETS** | **Explore Datasets** | `#nav-explore` | Opens the public dataset catalog (`visibility = PUBLIC`). |
| | **Upload Dataset** | `#nav-upload` | Opens the **Upload Dataset Modal** (`#uploadModal`). |
| | **My Datasets** | `#nav-my-datasets` | Filters the dataset view to datasets owned/uploaded by the current user. |
| | **Bookmarked** | `#nav-bookmarked` | Displays datasets bookmarked by the current administrator. |
| **DATABASES** | **MySQL** | `.db-nav-item[data-db="MySQL"]` | Opens the dedicated **MySQL Engine Screen**. |
| | **SQLServer** | `.db-nav-item[data-db="SQLServer"]` | Opens the dedicated **SQL Server Engine Screen**. |
| | **PostgreSQL** | `.db-nav-item[data-db="PostgreSQL"]` | Opens the dedicated **PostgreSQL Engine Screen**. |
| | **MongoDB** | `.db-nav-item[data-db="MongoDB"]` | Opens the dedicated **MongoDB Engine Screen**. |
| | **Neo4J** | `.db-nav-item[data-db="Neo4J"]` | Opens the dedicated **Neo4J Engine Screen**. |
| | **CouchBase** | `.db-nav-item[data-db="CouchBase"]` | Opens the dedicated **Couchbase Engine Screen**. |
| **TOOLS** | **Search** | `#nav-search-tool` | Focuses the global multi-field search bar (`#globalSearchInput`). |
| | **Analytics** | `#nav-analytics-tool` | Opens the dedicated **Platform Telemetry & Multi-Engine Analytics Screen** (`#analyticsScreenWrap`). |
| | **Data Requests** | `#nav-requests-tool` | Opens the **Community Data Ingestion Requests Board** (`#dataRequestsScreenWrap`). |
| **ACCOUNT** | **Profile** | `#nav-profile` | Opens the **Administrator Profile Screen** (`#profileScreenWrap`). |
| | **Settings** | `#nav-settings` | Opens the **Platform Configuration & Preferences Screen** (`#settingsScreenWrap`). |

---

## 4. Top Navigation Header (`.top-header`)

1. **Global Search Bar (`#globalSearchInput`):**
   - Supports keyboard shortcut `Ctrl + K`.
   - Performs real-time debounced search across dataset names, descriptions, categories, file formats (`CSV`, `JSON`, `XLSX`, etc.), database engines, and contributor names/emails.
2. **Theme Toggle Button (`#themeToggleBtn`):**
   - Switches between Light and Dark mode instantaneously.
3. **Notification Bell & Dropdown Panel (`#notificationBtn`, `#notificationPanel`):**
   - Displays unread badge count (`#notificationCount`) fetched from `GET /api/notifications/count`.
   - Clicking a notification marks it as read (`PATCH /api/notifications/:id/read`); clicking **Mark all read** (`#btnMarkAllRead`) clears all unread indicators.
4. **Create Admin Button (`#btnCreateAdminTop`):**
   - Opens the **Administrator Management Modal** (`#createAdminModal`) for Super Administrators to invite and manage administrators.
5. **User Profile Chip & Dropdown (`#userProfileChip`, `#profileDropdownMenu`):**
   - Displays the logged-in user's dynamic initials (`#userAvatarInitials`), full name (`#userDisplayName`), and role (`Super Administrator` or `Data Administrator`).
   - Dropdown provides quick links to **My Profile**, **Platform Settings**, **Switch / Sign In**, and **Sign Out** (`#btnLogout`).

---

## 5. Center Viewport Screens (`.center-content`)

### 5.1 Main Dashboard Overview (`#dashboardOverviewGroup`)
- **Real-Time Hero Banner (`#heroGreeting`):**
  - Dynamically greets the logged-in user based on the real-time local clock (`Good morning`, `Good afternoon`, or `Good evening`) and their exact name (`Super Admin` or the administrator's full name), refreshing automatically every 30 seconds.
- **4 Key Performance Indicator (KPI) Cards:**
  - **Total Datasets (`#kpiTotalDatasets`):** Total accessible datasets across all 6 engines.
  - **Total Contributors (`#kpiTotalContributors`):** Distinct administrators contributing datasets.
  - **Categories (`#kpiCategories`):** Active domain taxonomy count (Education, Finance, Healthcare, Transportation, Business, Demographics, Environment).
  - **Total Downloads (`#kpiTotalDownloads`):** Cumulative dataset exports and downloads recorded in the system logs.
- **Dataset Activity Line Chart (`#activityChartContainer`):**
  - Interactive SVG cubic-bezier area/line chart with hover tooltips (`#chartTooltip`) showing daily operational activity over the selected period (`Last 7 days`, `Last 30 days`, `Last 90 days` via `#activityPeriodSelect`).
- **Datasets by Database Donut Chart (`.donut-visual-wrap`, `.donut-legend`):**
  - Displays proportional distribution, dataset counts, percentages, and **real storage occupied** (`B`, `KB`, `MB`, `GB`) per database engine.
  - Clicking any donut segment or legend row opens that database engine's dedicated screen.
- **Recent Datasets Table (`#datasetsTableSection`):**
  - Displays `Dataset Name`, `Database` badge, `Category` pill, `Format`, `Size`, `Updated By` (contributor avatar + name), `Updated` relative timestamp, and the row action menu (`⋯`).
  - Includes pagination controls (`#btnPrevPage`, `#pageIndicator`, `#btnNextPage`).

---

### 5.2 Dedicated Database Engine Screen (`#databaseScreenHeaderWrap`)
Triggered by clicking any of the 6 databases in the Left Sidebar, Donut Chart, Analytics Screen, or Right Sidebar Database Center.

- **Top Breadcrumb & Back Bar:** Returns to the main Dashboard (`#btnBackToDashboard`).
- **Database Engine Hero Card (`#dbEngineHero`):**
  - Displays the engine's icon, title, connection status pill (`Connected (Port ...)`), classification pill, live dataset count + **accurate storage occupied** (`#dbHeroDatasetCountText`, e.g., `3 Datasets Stored • 14.2 KB`), and a direct **Upload Dataset to `<Engine>`** button (`#btnUploadToThisDb`).
- **Two Switchable Tabs:**
  1. **Stored Datasets (`#dbTabDatasets`):** Filters the Datasets Table exclusively to datasets stored in or routed to the active database engine.
  2. **Engine Specs & Architecture (`#dbTabSpecs`):** Displays 4 specification cards (`Connection & Host`, `Engine Classification`, `Supported Formats`, `Driver & Connectivity`) and capability chips (`#specFeaturesChips`).

#### Complete Specifications of the 6 Integrated Database Engines
| Engine | Classification | Host & Port | Driver / Protocol | Supported Formats | Key Architectural Capabilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MySQL** | Relational / SQL | `localhost:3306` | Prisma / `mysql2` Client | `CSV`, `TSV`, `XLSX`, `JSON` | ACID Transactions, Foreign Keys, B-Tree Indexes, Structured SQL Queries, Strict Type Normalization |
| **SQLServer** | Relational / Enterprise | `localhost:1433` | `tedious` / `mssql` Client | `CSV`, `XLSX`, `TSV` | T-SQL Support, Clustered Indexes, Enterprise Compliance, Cross-table Views, Analytical Store |
| **PostgreSQL** | Object-Relational / JSONB | `localhost:5434` (System) / `5435` (Logs) | `@prisma/client` (PostgreSQL) | `CSV`, `JSON`, `NDJSON`, `XLSX` | JSONB Columns, Partitioning, GIN & GiST Indexes, Automated Migration, 5 Log Stream Partitions |
| **MongoDB** | Document Store / NoSQL | `localhost:27017` | `mongodb` Native Driver | `JSON`, `NDJSON`, `XML` | Dynamic BSON Schemas, Nested Arrays & Objects, Aggregation Pipeline, Secondary Indexes, Polymorphic Documents |
| **Neo4J** | Graph Database | `localhost:7687` (Bolt) / `7474` (HTTP) | `neo4j-driver` (Cypher Bolt) | `JSON`, `CSV` (Nodes & Edges) | Cypher Query Language, Index-Free Adjacency, Directed Property Graphs, Shortest Path Algorithms, Entity Graphs |
| **CouchBase** | Key-Value & Document | `localhost:8091` / `8094` / `11210` | `couchbase` SDK / N1QL | `JSON`, `NDJSON`, Key-Value | Sub-Millisecond Key-Value Access, N1QL (SQL for JSON), In-Memory Managed Caching, Sub-Document Operations |

---

### 5.3 Platform Telemetry & Multi-Engine Analytics Screen (`#analyticsScreenWrap`)
- **Timeframe Selector (`#analyticsTimeframeBtns`):** Switch between `7D`, `30D`, `90D`, and `1Y` telemetry windows.
- **4 Telemetry KPI Cards:** `Managed Datasets`, `Active Contributors`, `Active Domains`, and `Total Exports & Queries`.
- **Database Storage Load Distribution (`#engineAnalyticsList`):** Horizontal progress bars for all 6 engines displaying dataset count, **accurate storage occupied**, and share percentage. Clicking any row opens that engine's screen.
- **Dataset Category Composition (`#categoryAnalyticsList`):** Breakdown across the 7 domain categories (`Education`, `Finance`, `Healthcare`, `Transportation`, `Business`, `Demographics`, `Environment`). Clicking any category filters the datasets table.
- **Activity & Ingestion Velocity (`#analyticsTimelineChart`):** Daily bar chart of uploads and queries.
- **Database Ports & Health Matrix (`#dbHealthMatrix`):** Live status pulse, port number, ping latency, dataset count, storage size, and quick **Inspect →** button for each of the 6 engines.

---

### 5.4 Community Data Ingestion Requests Screen (`#dataRequestsScreenWrap`)
- **Purpose:** Collaborative board where users propose new datasets for ingestion, upvote requests, and track fulfillment status.
- **Controls:**
  - **+ Submit Data Request (`#btnOpenNewRequestModal`):** Opens `#submitRequestModal` to specify Title, Description, Category Domain, Preferred Storage Engine, Desired Format (`CSV`, `JSON`, `XLSX`, `NDJSON`, `TSV`, `XML`), and Urgency Priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).
  - **Status Filter Tabs (`#requestsStatusTabs`):** Filter by `All Requests`, `Pending`, `Approved`, `In Progress`, or `Fulfilled`.
  - **Keyword Search (`#requestsSearchInput`):** Real-time filtering by title, engine, or requester.
  - **Interactive Actions:** Upvote requests or advance request status (`Approve`, `Mark In Progress`, `Fulfill`).

---

### 5.5 Administrator Profile Screen (`#profileScreenWrap`)
- **Profile Hero Banner (`#profileHero`):** Shows large avatar initials (`#profileLargeAvatar`), full name, role badge, verification status (`✓ Verified`), email, and department.
- **Card 1 — Profile Information (`#profileInfoForm`):** Update Full Name, Email Address, and Department/Operational Unit.
- **Card 2 — Security & Credentials (`#profilePasswordForm`):** Update account password using Argon2id hashing (minimum 12 characters).
- **Card 3 — Authorized Database Engines (`.engine-perm-grid`):** Displays active privileges (`READ`, `WRITE`, `DDL`, `SCHEMA`, `PARTITION`, `AGGREGATE`, `QUERY`, `CYPHER`, `BUCKET`) across all 6 database engines.
- **Card 4 — Session & Account Actions:** Displays JWT Access Token + 30-day Refresh Cookie status with **Switch Account** and **Sign Out** buttons.

---

### 5.6 System & Platform Settings Screen (`#settingsScreenWrap`)
- **Card 1 — Appearance & Display:** Color Theme (`Light` / `Dark`), Table Display Density (`Comfortable` / `Compact`), Glassmorphism toggle (`#toggleGlassmorphism`), and Smooth UI Transitions toggle (`#toggleAnimations`).
- **Card 2 — Notifications & Alerts:** Toggle In-App Toast Messages, New Data Request Alerts, Security & Audit Event Alerts, and view **Email Gateway Provider** status (`Connected (Brevo)`).
- **Card 3 — Storage & Export Defaults:** Configure Default Storage Engine (`#settingDefaultEngine`), Default Export Format (`CSV`, `JSON`, `XLSX`, `NDJSON`), and Automated Schema Profiling (`#toggleAutoProfile`).
- **Card 4 — Network & Public Endpoint:** View/copy the configured `APP_BASE_URL` and run a live **Ping API** health check (`GET /api/health`) via `#btnTestApiHealth`.

---

## 6. Right Sidebar Operational Panel (`.right-panel`)

1. **Database Center (`.db-cards-grid`):**
   - Displays 6 color-coded cards (`MySQL`, `SQLServer`, `PostgreSQL`, `MongoDB`, `Neo4J`, `CouchBase`).
   - Each card shows the real-time **dataset count** (`.db-card-count`), **actual storage occupied** (`.db-card-size`, e.g., `0 B`, `14.2 KB`, `3.4 MB`), and an **Explore →** button.
2. **Quick Actions (`.quick-actions-grid`):**
   - **Upload Dataset (`#btnQuickUpload`):** Launches the Upload Dataset Modal.
   - **Explore Datasets (`#btnQuickExplore`):** Opens the public datasets view.
   - **My Datasets (`#btnQuickMyDatasets`):** Opens the current administrator's uploaded datasets.
   - **View Analytics (`#btnQuickAnalytics`):** Opens the Platform Analytics Screen.
3. **Activity Feed (`#activityFeedList`):**
   - Displays real-time operational and administrative events from the system and audit log streams (`ADMIN_CREATED`, `ADMIN_STATUS_CHANGED`, `ADMIN_DELETED`, `VERIFICATION_RESENT`, `PASSWORD_SETUP`, `DATASET_UPLOAD_SUCCESS`, `DATASET_DELETED`, `DATASET_UPDATED`, etc.) while excluding noisy passive read events and login/logout events.
   - Immediately updates when a new administrator is created (e.g., `Super Admin created administrator <Name> (<email>)`) or when datasets are uploaded/deployed.
   - Clicking **View all →** (`#viewAllActivityLink`) opens the full **System Activity Logs Modal**.

---

## 7. Modals & Interactive Workflows

### 7.1 Upload Dataset Modal (`#uploadModal`)
- **Supported File Formats:** `.csv`, `.tsv`, `.json`, `.ndjson`, `.jsonl`, `.xml`, `.xlsx`.
- **Auto-Detection:** Selecting a file automatically populates the **Dataset Name** (formatted from the filename) and **File Size** (`B`, `KB`, `MB`, `GB`).
- **Visibility Control:** Choose `PRIVATE (Owner Only)` or `PUBLIC (Shared with All)`.
- **Automated Schema Analysis:** Upon upload (`POST /api/datasets/upload`), DataVault6 parses records, detects field types, identifies candidate keys, and recommends the optimal database engine.

### 7.2 Dataset Analysis, Profiling & Storage Deployment Modal (`#datasetDetailsModal`)
- **Triggered via:** Clicking a dataset row or selecting **View Analysis & Profiling** from the row action menu (`#datasetActionMenu`).
- **Features:**
  - **Recommended Database Engine Hero Card:** Shows the top-recommended engine, match score percentage, data classification (`RELATIONAL`, `DOCUMENT`, `GRAPH`, `KEY_VALUE`), and structural reasoning.
  - **6-Engine Compatibility Matrix:** Evaluates all 6 engines as `✓ Active Storage`, `★ Top Recommendation`, `✓ Appropriate`, or `✕ Inappropriate` with match score bars.
  - **One-Click Storage Deployment (`.btn-engine-deploy`):** Clicking **Deploy to `<Engine>`** (`POST /api/datasets/:id/storage`) provisions and routes the dataset into the chosen database engine and updates all storage indicators in real time.
  - **Detected Schema Fields Table:** Lists every field name, inferred data type, null percentage, uniqueness percentage, and primary key candidates.

### 7.3 Floating Dataset Action Menu (`#datasetActionMenu`)
- **Download / Export Formats:**
  - **Download CSV** (`GET /api/datasets/:id/export?format=csv`)
  - **Download JSON** (`GET /api/datasets/:id/export?format=json`)
  - **Download XLSX** (`GET /api/datasets/:id/export?format=xlsx`)
- **Bookmark Toggle:** Adds or removes the dataset from the user's **Bookmarked** list (`POST /api/datasets/:id/bookmark`).
- **View Analysis & Profiling:** Opens `#datasetDetailsModal`.

### 7.4 System Activity Logs Modal (`#activityLogsModal`)
- **Stream Filter Chips:**
  - `All System Activities` (`stream=all`)
  - `Dataset Uploads` (`stream=dataset-activity`)
  - `Storage & DB Ops` (`stream=database-activity`)
  - `Queries & Exports` (`stream=dataset-activity`)
  - `Audit & Admin` (`stream=audit` — includes `ADMIN_CREATED`, `ADMIN_STATUS_CHANGED`, `ADMIN_DELETED`, etc.)
- **Search & Export:** Filter logs by keyword (`#logsSearchInput`) or export the full log stream as a JSON file via **Export Logs (JSON)** (`#btnExportLogs`).

### 7.5 Administrator Management Modal (`#createAdminModal` — Super Admin Only)
- **Tab 1 — Create Admin (`#adminTabCreate`):**
  - Enter **Full Name** (`#adminNameInput`), **Official Email Address** (`#adminEmailInput`), **Department / Unit**, and **Engine Access & Permissions**.
  - Submitting (`POST /api/admins`) creates the administrator in `PENDING` status, syncs to PostgreSQL + Cloud Firestore, dispatches the verification/password-setup email via Brevo SMTP, and logs `ADMIN_CREATED` to the Activity Feed.
  - For security, no password setup or verification link is exposed in the Super Admin UI.
- **Tab 2 — Admin Directory (`#adminTabDirectory`):**
  - Search administrators by name/email (`#adminSearchInput`), **Sync to Firebase** (`#btnSyncFirebaseAdmins`), or **Refresh** (`#btnRefreshAdmins`).
  - **Row Lifecycle Actions:**
    - For `PENDING` admins: **Activate** (direct activation with custom or auto-generated password), **Resend Invite** (resends verification email), or **Revoke** (disables the pending invitation).
    - For `ACTIVE` admins: **Disable** account access.
    - For `DISABLED` admins: **Activate / Enable** account or permanently **Delete** (`DELETE /api/admins/:id`).

---

## 8. Role-Based Access Control (RBAC) Summary in UI

| Capability / UI Feature | Super Administrator (`SUPER_ADMIN`) | Data Administrator (`ADMIN`) |
| :--- | :---: | :---: |
| View Dashboard KPIs, Charts, & Storage Occupied | All Platform Datasets (Public + Private) | Own Datasets + All Public Datasets |
| Upload, Analyze, & Deploy Datasets to 6 Engines | Yes | Yes (Own Datasets) |
| Export Datasets (`CSV`, `JSON`, `XLSX`) | All Datasets | Own + Public Datasets |
| Update or Delete Datasets | All Datasets | Own Datasets Only |
| Create / Invite New Administrators (`#createAdminModal`) | Yes | Restricted (403 Forbidden) |
| Activate, Disable, Revoke, or Delete Administrators | Yes | Restricted (403 Forbidden) |
| Sync Administrators to Cloud Firestore | Yes | Restricted (403 Forbidden) |
