# DataVault6 UI — Features, Architecture & Technical Specifications

## 1. Executive Summary & System Identity

**DataVault6** includes a dedicated, high-performance administrative single-page user interface located in [`apps/web`](file:///home/johnlee/DataBase/NEXUS-6/apps/web).

This UI allows administrators, data engineers, contributors, and operators to manage datasets, inspect storage partitions across six supported database engines, visualize telemetry, and monitor operational activity logs in real time without requiring any complex frontend framework runtime (no React, Vue, Angular, or Next.js).

* **System Name**: DataVault6
* **System Title**: Centralized Dataset Collection & Multi-Database Management System
* **Architecture**: Standalone User Interface (HTML5, Vanilla CSS3, Vanilla JavaScript ES6+)
* **Zero Heavy Frameworks**: Completely pure client execution. No React virtual DOM, hydration delays, or complex component overhead.
* **Serving Location**: Hosted from `apps/web/` via Vite dev server / preview on port `8080` (or `8081`), proxying API requests to the backend API (`http://localhost:4000/api`).
* **Core Philosophy**: Instant load times, zero bundle hydration delays, lightweight footprint, and direct alignment with backend data models and database storage engines.

---

## 2. Serving Topology & Separation of Concerns

The architecture cleanly separates the user interface (`apps/web`) from the headless REST API service (`apps/api`):

```
      ┌────────────────────────────────┐              ┌────────────────────────────────┐
      │          apps/web UI           │              │         apps/api Backend       │
      │       (Port 8080 / 8081)       │              │           (Port 4000)          │
      └──────────────┬─────────────────┘              └────────────────┬───────────────┘
                     │                                                 │
        Static Assets (HTML/CSS/JS)                               REST API Endpoints
      ├── index.html                                          ├── /api/auth
      ├── style.css                                           ├── /api/datasets
      └── app.js                                              ├── /api/databases
                     │                                        ├── /api/logs
                     └──────────── Proxy /api Request ────────┘
```

### Vite Dev & Proxy Implementation
In [`apps/web/vite.config.js`](file:///home/johnlee/DataBase/NEXUS-6/apps/web/vite.config.js):
```javascript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8080,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
```

---

## 3. UI Layout & Visual Architecture

The DataVault6 UI is built on a responsive 3-column / 2-tier dashboard architecture engineered for high-density information displays:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR (250px)    │  TOP NAVIGATION HEADER (Sticky, 72px)                            │
│                     │  [ Global Search: Ctrl+K ]        [Theme] [Notifications] [User] │
├─────────────────────┼────────────────────────────────────────┬─────────────────────────┤
│ • Brand: DataVault6 │  CENTER WORKSPACE                      │  RIGHT PANEL (340px)    │
│                     │                                        │                         │
│ [DATASETS]          │  ┌──────────────────────────────────┐  │  ┌────────────────────┐ │
│ • Dashboard         │  │ HERO BANNER: Greeting + 3D Visual│  │  │ DATABASE CENTER    │ │
│ • Explore Datasets  │  └──────────────────────────────────┘  │  │ • MySQL (324)      │ │
│ • Upload Dataset    │                                        │  │ • SQLServer (182)  │ │
│ • My Datasets       │  ┌───────┬───────┬───────┬──────────┐  │  │ • PostgreSQL (215) │ │
│ • Bookmarked        │  │ Total │ Contri│ Categ │Downloads │  │  │ • MongoDB (156)    │ │
│                     │  │ 1,248 │  386  │  52   │  18,492  │  │  │ • Neo4J (291)      │ │
│ [DATABASES]         │  └───────┴───────┴───────┴──────────┘  │  │ • CouchBase (80)   │ │
│ • MySQL             │                                        │  └────────────────────┘ │
│ • SQLServer         │  ┌──────────────────┬───────────────┐  │                         │
│ • PostgreSQL        │  │ Dataset Activity │ Datasets by DB│  │  ┌────────────────────┐ │
│ • MongoDB           │  │ (Interactive SVG)│ (Donut Chart) │  │  │ QUICK ACTIONS      │ │
│ • Neo4J             │  └──────────────────┴───────────────┘  │  │ [Upload] [Explore] │ │
│ • CouchBase         │                                        │  │ [My Data][Analytics│ │
│                     │  ┌──────────────────────────────────┐  │  └────────────────────┘ │
│ [TOOLS & ACCOUNT]   │  │ RECENT DATASETS TABLE            │  │                         │
│ • Search / Analytics│  │ • Columns: Name, DB, Cat, Size...│  │  ┌────────────────────┐ │
│ • Profile / Settings│  │ • Filterable, actions menu       │  │  │ ACTIVITY FEED      │ │
│                     │  └──────────────────────────────────┘  │  │ • System Operations│ │
│ ~ SVG Wave Footer ~ │                                        │  │ • (No Logins)      │ │
└─────────────────────┴────────────────────────────────────────┴──┴────────────────────┘─┘
```

### Layout Grid Dimensions
| Section | Selector | Width / Height | Position / Scrolling |
| :--- | :--- | :--- | :--- |
| **Sidebar** | `.sidebar` (`#sidebar`) | Fixed `250px` width | Sticky `100vh`, vertical auto-scroll |
| **Main Wrapper** | `.main-wrapper` | `calc(100% - 250px)` | Flexible flex container |
| **Top Header** | `.top-header` | Height `72px` | Sticky `top: 0`, z-index `100`, backdrop blur |
| **Center Workspace** | `.center-content` | Flexible `min-width: 0` | Primary vertical content flow |
| **Right Panel** | `.right-panel` | Fixed `340px` width | Sticky side rail for telemetry & quick tools |

---

## 4. Comprehensive Feature Specifications

### 4.1 Left Navigation Sidebar
The left sidebar provides persistent access to dataset categories, database engines, analytical tools, and account configuration.

* **Brand Header (`.brand`)**:
  * Features the custom SVG logo: A 3-layer database cylinder with blue linear gradient stops (`#1E3A8A` to `#2563EB`).
  * System title: **DataVault6** (font weight 800).
  * System subtitle: *Centralized Dataset Collection System*.
* **Navigation Sections**:
  1. **Dashboard** (`#nav-dashboard`): Default active view. Resets all table filters and returns to top-level overview.
  2. **DATASETS Header**:
     * `Explore Datasets` (`#nav-explore`): Activates explore mode and focuses search.
     * `Upload Dataset` (`#nav-upload`): Opens `#uploadModal`.
     * `My Datasets` (`#nav-my-datasets`): Opens a dedicated screen (`#databaseScreenHeaderWrap`) showcasing datasets uploaded and managed by the authenticated user's account.
     * `Bookmarked` (`#nav-bookmarked`): Opens a dedicated screen (`#databaseScreenHeaderWrap`) showcasing the user's saved/starred datasets with gold accent styling, custom specs, and quick export actions.
  3. **DATABASES Header**:
     * Six dedicated database items (`MySQL`, `SQLServer`, `PostgreSQL`, `MongoDB`, `Neo4J`, `CouchBase`).
     * Each item features a color-coded icon circle matching that database's brand color token.
     * Clicking any database item opens a dedicated single-database partition screen with connectivity specs and filtered datasets.
  4. **TOOLS Header**:
     * `Search` (`#nav-search-tool`): Opens the dedicated "Dataset Search & Filter Engine" screen, highlights and pulses the search input (`.search-pulse`), and offers real-time keyword, category, format, and multi-engine filtering.
     * `Analytics` (`#nav-analytics-tool`): Opens the dedicated "Platform Telemetry & Multi-Engine Analytics" screen (`#analyticsScreenWrap`) with live KPIs, database storage load distribution bars, category domain breakdown, 30-day activity velocity chart, and 6-database port connectivity matrix.
     * `Data Requests` (`#nav-requests-tool`): Opens the dedicated "Community Data Ingestion Requests" board (`#dataRequestsScreenWrap`) with status filter tabs (All, Pending, Approved, In Progress, Fulfilled), real-time upvoting, fulfill shortcuts, and proposal submission modal (`#submitRequestModal`).
  5. **ACCOUNT Header**:
     * `Profile` (`#nav-profile`): User account details and access tier.
     * `Settings` (`#nav-settings`): UI customization, theme preferences, and API keys.
* **Sidebar Wave Graphic (`.sidebar-wave`)**:
  * Dual-layer SVG wave anchored at the bottom of the sidebar.
  * Rendered with linear gradients (`#wave-gradient` and `#wave-gradient-2`) and semi-transparent opacity stops (`0.6` and `0.8`).

---

### 4.2 Top Navigation Header
* **Height**: `72px` sticky header with `backdrop-filter: blur(12px)` and subtle bottom border (`--border-subtle`).
* **Global Command & Search Bar (`.search-box`)**:
  * Input field (`#globalSearchInput`): "Search datasets, keywords, contributors...."
  * Keyboard Shortcut Pill: Display badge `Ctrl + K`.
  * Keyboard listener: Pressing `Ctrl + K` (Windows/Linux) or `Cmd + K` (macOS) prevents default browser behavior and immediately focuses the search field.
  * Real-Time Fuzzy Filter: Evaluates keystrokes instantly against dataset name, description, category, database engine, format, and contributor.
* **Header Actions (`.header-actions`)**:
  * **Theme Toggle Button** (`#themeToggleBtn`): Toggles between Light and Dark mode. Persists selection in `localStorage.getItem("datavault6_theme")`.
  * **Notification Bell** (`#notificationBtn`): Contains an alert badge (`#notificationCount`) initialized to `3`. Triggers unread notification overview.
  * **User Profile Chip** (`#userProfileChip`): Displays user avatar (SVG circle with user silhouette), username (**JLee**), role (**Data Contributor**), and dropdown chevron.

---

### 4.3 Center Workspace: Hero Banner & Telemetry KPIs

#### Hero Banner (`.hero-banner`)
* **Hero Text**: Personalized greeting ("Good morning, JLee!") with subtext ("Discover, contribute, and manage datasets all in one place.").
* **Hero Illustration**: Custom 220x140 vector graphic featuring 3D database storage cylinders with SVG drop shadow glow filter (`#glow`) and floating holographic data cards with animated accent lines.

#### 4 KPI Telemetry Cards (`.metrics-row`)
Four high-contrast telemetry cards display real-time system performance metrics:

```
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ [Icon: Blue Database] │ │ [Icon: Green Users]   │ │ [Icon: Purple Grid]   │ │ [Icon: Cyan Download] │
│ 1,248                 │ │ 386                   │ │ 52                    │ │ 18,492                │
│ Total Datasets        │ │ Total Contributors    │ │ Categories            │ │ Total Downloads       │
│ ↑ 12% vs. last month  │ │ ↑ 8% vs. last month   │ │ ↑ 5% vs. last month   │ │ ↑ 20% vs. last month  │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

1. **Total Datasets** (`#kpiTotalDatasets`):
   * Initial baseline: `1,248`
   * Trend: `↑ 12% vs. last month`
   * Reactive state: Automatically increments by 1 immediately when a user uploads a new dataset via the upload modal.
2. **Total Contributors** (`#kpiTotalContributors`):
   * Initial baseline: `386`
   * Trend: `↑ 8% vs. last month`
3. **Categories** (`#kpiCategories`):
   * Initial baseline: `52`
   * Trend: `↑ 5% vs. last month` (covering Education, Environment, Transportation, Demographics, Business, Finance, Healthcare).
4. **Total Downloads** (`#kpiTotalDownloads`):
   * Initial baseline: `18,492`
   * Trend: `↑ 20% vs. last month`

---

### 4.4 Interactive Telemetry Charts

#### 1. Dataset Activity Area Chart (`#activityChartContainer`)
* **Vector Engine**: Pure SVG responsive rendering with `viewBox="0 0 460 210"` and `preserveAspectRatio="none"`.
* **Path Geometry**: Formatted using cubic bezier smooth curves:
  `M 45 158 Q 75 130, 110 135 T 175 105 T 240 128 T 305 65 T 370 102 T 435 55`
* **Visual Gradient**: Filled area path using `#areaGradient` (`#3B82F6` with 35% opacity fading to 0%).
* **Stroke Styling**: 3px solid blue (`#3B82F6`) curve with rounded line caps.
* **Timeframe Selector** (`#activityPeriodSelect`):
  * Options: `Last 7 days`, `Last 14 days`, `Last 30 days`.
  * Trigger: Switching options triggers an operational telemetry query activity log entry.
* **Interactive Data Nodes** (`.chart-dot`):
  * Seven plotted coordinate points with `data-val` and `data-date` attributes.
  * Hover interaction: Dynamically calculates bounding client rect and positions the floating tooltip (`#chartTooltip`) showing exact dates and activity totals.

#### 2. Datasets by Database Donut Chart
* **Visual Engine**: SVG circular progress segments with calculated `stroke-dasharray` and `stroke-dashoffset` properties.
* **6-Engine Proportional Representation**:
  * **MySQL**: 324 datasets (26%) — `#2563EB` (Dash: `88 251`, Offset: `0`)
  * **SQLServer**: 182 datasets (15%) — `#10B981` (Dash: `51 288`, Offset: `-88`)
  * **PostgreSQL**: 215 datasets (17%) — `#06B6D4` (Dash: `58 281`, Offset: `-139`)
  * **MongoDB**: 156 datasets (13%) — `#F43F5E` (Dash: `44 295`, Offset: `-197`)
  * **Neo4J**: 291 datasets (23%) — `#8B5CF6` (Dash: `78 261`, Offset: `-241`)
  * **CouchBase**: 80 datasets (6%) — `#14B8A6` (Dash: `20 319`, Offset: `-319`)
* **Center Metric Readout**:
  * Centered bold count: `#donutTotalDatasets` (`1,248`).
  * Subtitle: `Total Datasets`.
* **Interactive Donut Legend**:
  * Color-coded legend rows with dots (`.legend-dot`).
  * Hovering over any legend item or donut segment displays floating tooltip with the engine name and exact share percentage.

---

### 4.5 Multi-Database Center (The 6 Engines)

The right sidebar hosts the 6-database cluster cards grid (`.db-cards-grid`):

| Database Engine | Engine Architecture | Default Datasets | Storage Footprint | Primary Color Token | Accent Background |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MySQL** | Relational / OLTP | 324 datasets (26%) | 4.2 GB | `#2563EB` (Brand Blue) | `#EFF6FF` |
| **SQLServer** | Enterprise Relational | 182 datasets (15%) | 2.8 GB | `#10B981` (Emerald Green) | `#ECFDF5` |
| **PostgreSQL** | Relational / Geospatial | 215 datasets (17%) | 3.1 GB | `#06B6D4` (Cyan) | `#ECFEFF` |
| **MongoDB** | Document Store | 156 datasets (13%) | 1.9 GB | `#F43F5E` (Rose) | `#FFF1F2` |
| **Neo4J** | Graph Database | 291 datasets (23%) | 5.7 GB | `#8B5CF6` (Purple) | `#FAF5FF` |
| **CouchBase** | Key-Value / Memory Cache | 80 datasets (6%) | 1.2 GB | `#14B8A6` (Teal) | `#F0FDFA` |

#### Interactivity & Exploration Flow
* **"Explore &rarr;" Buttons** (`.btn-db-explore`):
  * Filter the Recent Datasets table to show only records allocated to that database.
  * Trigger a notification toast: `Filtered datasets for <Database> (<count> found)`.
  * Record an operational activity log entry: `JLee inspected storage cluster <Database>`.
* **"View all &rarr;" Header Link** (`#viewAllDatabasesLink`):
  * Clears database filters and restores the full dataset table display.

---

### 4.6 Recent Datasets Table (`#recentDatasetsTable`)

The recent datasets section provides a tabular view of active dataset records:

* **Header Controls**:
  * Section title: `Recent Datasets`.
  * Action link: `View all →` (`#viewAllDatasetsLink`).
* **Table Columns (8)**:
  1. **Dataset Name & Description**: Document icon with category-specific color, bold dataset title, and secondary description.
  2. **Database Engine**: Colored badge tag identifying the target engine (`.badge-db01` to `.badge-db06`).
  3. **Category**: Classification tag (`Education`, `Environment`, `Transportation`, `Demographics`, `Business`, `Finance`, `Healthcare`).
  4. **Format**: Format badge (`CSV` green/gray, `XLSX` emerald, `JSON` amber).
  5. **Size**: Monospace storage size (e.g. `24.5 MB`).
  6. **Updated By**: Contributor avatar with initials and full name.
  7. **Updated**: Relative time badge (`2 hours ago`, `Just now`).
  8. **Actions Menu**: Three-dot contextual menu button (`&vellip;`).

#### Initial Seed Datasets
1. **Student Enrollment Dataset** (MySQL, Education, CSV, 24.5 MB, John D., 2 hours ago)
2. **Weather Data 2026** (PostgreSQL, Environment, XLSX, 45.2 MB, Maria S., 5 hours ago)
3. **Traffic Accident Records** (SQLServer, Transportation, CSV, 12.8 MB, Rizal T., 1 day ago)
4. **Population Statistics** (MongoDB, Demographics, JSON, 8.4 MB, Ana P., 1 day ago)
5. **Sales Report 2026** (Neo4J, Business, XLSX, 32.6 MB, Carlos M., 2 days ago)

---

### 4.7 Quick Action Hub

Located in the right sidebar, four styled action buttons provide immediate shortcuts:

1. **Upload Dataset** (`#btnQuickUpload`):
   * Primary blue button with upload SVG icon.
   * Opens `#uploadModal`.
2. **Explore Datasets** (`#btnQuickExplore`):
   * Soft blue surface button with search SVG icon.
   * Focuses the global search bar and activates filtering mode.
3. **My Datasets** (`#btnQuickMyDatasets`):
   * Soft green surface button with list SVG icon.
   * Filters the dataset table to show records contributed by `JLee` / `John D.`.
   * Records a `QUERY` activity log: `JLee filtered contributor workspace`.
4. **View Analytics** (`#btnQuickAnalytics`):
   * Soft pink surface button with analytics graph SVG icon.
   * Smooth-scrolls viewport to the telemetry charts row.
   * Records a `QUERY` activity log: `JLee viewed system analytics`.

---

## 5. Operational Activity Logging System (UI Implementation)

### 5.1 Strict Separation Principle
The activity logging interface adheres strictly to the system's logging requirements:

> **IMPORTANT:**
> Authentication records (login attempts, login successes, login failures, logout events, and session refreshes) are strictly segregated into dedicated backend security audit log streams.
> **The UI Activity Feed and Activity Logs Viewer track EXCLUSIVELY internal operational events:**
> * Ingestions & Uploads
> * Storage Allocations & Mounts
> * Analytical Queries & Visualizations
> * Metadata Annotations & Schema Revisions

This is visibly communicated in the UI through the header badge `<span class="system-logs-tag">System Logs</span>` and the policy notice banner in the modal viewer.

---

### 5.2 Right Panel Live Activity Feed (`#activityFeedList`)
* Displays the four most recent operational activities.
* Each entry renders:
  * Contributor avatar circle with user initials (`MS`, `RT`, `AP`, `CM`, `JL`).
  * Actor name in bold text.
  * Operational action verb (`uploaded a new dataset`, `inspected storage cluster`, `commented on a dataset`).
  * Highlighted target resource link (`.activity-target`).
  * Relative timestamp (`Just now`, `5 hours ago`, `1 day ago`).

---

### 5.3 System Activity Logs Viewer Modal (`#activityLogsModal`)

Clicking **"View all &rarr;"** (`#viewAllActivityLink`) opens the modal viewer:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ System Activity Logs                                                       [Close (×)] │
│ Tracking all operational events, dataset uploads, queries, and system modifications    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ℹ️ Internal Activity Logs Policy: This stream records exclusively operational and data │
│    management events. User authentication, login, and logout events are completely     │
│    isolated in separate security logs and excluded from this view.                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [All System Activities] [Dataset Uploads] [Storage & DB Ops] [Queries] [Comments]      │
│ [ Search: Filter activity records...                                                 ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Timestamp   │ Actor    │ Action Type │ Target Resource │ Details              │ Status │
│ 00:32:15    │ Maria S. │ UPLOAD      │ Weather Data    │ 45.2 MB XLSX into PG │ SUCCESS│
│ 00:15:40    │ JLee     │ STORAGE     │ MySQL           │ Tablespace inspected │ SUCCESS│
│ ...         │ ...      │ ...         │ ...             │ ...                  │ ...    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 8 recorded system activities              [Simulate Activity] [Export Logs JSON]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Modal Components & Functionality:
1. **Policy Notice Banner (`.logs-banner`)**: Outlines the operational logging policy and confirms exclusion of authentication records.
2. **Category Filter Chips (`.filter-chip`)**:
   * `All System Activities` (`data-filter="ALL"`)
   * `Dataset Uploads` (`data-filter="UPLOAD"`)
   * `Storage & DB Ops` (`data-filter="STORAGE"`)
   * `Queries & Exports` (`data-filter="QUERY"`)
   * `Comments & Revisions` (`data-filter="COMMENT"`)
3. **Live Search Filter (`#logsSearchInput`)**: Real-time filtering across actor name, target entity, details, and action type.
4. **Full Logs Data Table (`#fullLogsTable`)**:
   * Columns: `Timestamp`, `Actor`, `Action Type`, `Target Resource`, `Details`, `Status`.
   * Action badges: `.action-upload` (blue), `.action-storage` (emerald), `.action-query` (purple), `.action-comment` (amber).
5. **Activity Simulator (`#btnSimulateActivity`)**:
   * Simulates real-time system operations (e.g., spatial index rebuilds in PostgreSQL, SQL aggregation queries in MySQL, GIS incident stream syncing).
   * Immediately records the event, updates `localStorage`, repopulates the modal table, and updates the live right-panel feed.
6. **JSON Export (`#btnExportLogs`)**:
   * Serializes the complete activity log collection into formatted JSON.
   * Automatically triggers browser file download named `DataVault6_System_Activity_Logs_<timestamp>.json`.
   * Displays confirmation toast.

---

## 6. Dataset Ingestion Workflow: Upload Modal (`#uploadModal`)

The upload modal enables complete end-to-end dataset registration:

```
┌────────────────────────────────────────────────────────┐
│ Upload Dataset to DataVault6               [Close (×)] │
├────────────────────────────────────────────────────────┤
│ Dataset Name *                                         │
│ [ e.g., Global Economic Index 2026                   ] │
│                                                        │
│ Description *                                          │
│ [ Brief description of the dataset contents...       ] │
│                                                        │
│ Category                       Target Database Engine  │
│ [ Education ▼                ] [ PostgreSQL ▼        ] │
│                                                        │
│ File Format                    Estimated Size          │
│ [ CSV ▼                      ] [ 16.2 MB             ] │
├────────────────────────────────────────────────────────┤
│                          [Cancel] [Upload & Record Log]│
└────────────────────────────────────────────────────────┘
```

### Submission Pipeline:
1. **Form Validation**: Verifies that `#datasetNameInput` and `#datasetDescInput` are populated.
2. **Dynamic DOM Insertion**: Constructs a new table row with proper format badge (`CSV`, `XLSX`, `JSON`) and database badge (`MySQL`, `SQLServer`, etc.), prepending it directly to `#datasetsTableBody`.
3. **Reactive KPI Increments**: Reads current values of `#kpiTotalDatasets` and `#donutTotalDatasets`, parses integers, increments by 1, and formats with thousands separators.
4. **Automatic Operational Logging**: Invokes `recordSystemActivity()`:
   * Action Type: `UPLOAD`
   * Target: Dataset Name
   * Details: `<Size> <Format> file ingested into <TargetDB>. Category: <Category>`
5. **Toast Notification**: Displays emerald success toast alert (`Activity recorded: uploaded a new dataset "<Name>"`).
6. **Form Reset & Cleanup**: Clears form fields and closes modal overlay.

---

## 7. Design System, CSS Architecture & Theming

### 7.1 Master Color Tokens (`style.css`)

```css
:root {
  /* Surface Tokens - Light Mode */
  --bg-app: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-surface-alt: #F1F5F9;
  --bg-sidebar: #0B1120;
  --bg-sidebar-hover: #1E293B;
  --border-subtle: #E2E8F0;
  --border-sidebar: #1E293B;

  /* Brand Blue Palette */
  --primary-50: #EFF6FF;
  --primary-100: #DBEAFE;
  --primary-500: #3B82F6;
  --primary-600: #2563EB;
  --primary-700: #1D4ED8;
  --primary-800: #1E40AF;
  --primary-900: #1E3A8A;

  /* Multi-Database Engine Accent Tokens */
  --emerald-500: #10B981;  /* SQLServer */
  --cyan-500: #06B6D4;     /* PostgreSQL */
  --rose-500: #F43F5E;     /* MongoDB */
  --purple-500: #8B5CF6;   /* Neo4J */
  --teal-500: #14B8A6;     /* CouchBase */
  --amber-500: #F59E0B;    /* Warnings / Revisions */

  /* Typography Colors */
  --text-main: #0F172A;
  --text-secondary: #475569;
  --text-muted: #64748B;
  --text-light: #94A3B8;
  --text-inverse: #FFFFFF;
}
```

### 7.2 Dark Mode Overrides (`[data-theme="dark"]`)
When `data-theme="dark"` is set on `document.documentElement`:
```css
[data-theme="dark"] {
  --bg-app: #070B14;
  --bg-surface: #0F172A;
  --bg-surface-alt: #1E293B;
  --bg-sidebar: #050811;
  --bg-sidebar-hover: #111827;
  --border-subtle: #1E293B;
  --border-sidebar: #111827;

  --text-main: #F8FAFC;
  --text-secondary: #CBD5E1;
  --text-muted: #94A3B8;
  --text-light: #64748B;
  --grid-color: #1E293B;
}
```

### 7.3 Typography
* **Primary Sans**: `Plus Jakarta Sans`, system-ui, -apple-system, sans-serif (Weights: 400, 500, 600, 700, 800).
* **Monospace / Telemetry Numbers**: `JetBrains Mono`, monospace (Used for sizes, counts, percentages, and timestamps).

### 7.4 Responsive Breakpoints
* **Desktop Wide (`> 1280px`)**: Standard 3-column layout.
* **Laptop / Condensed (`1024px - 1280px`)**: Right sidebar compacts to `300px`, chart grid scales proportionally.
* **Tablet (`768px - 1023px`)**: Dashboard grid wraps; right panel stacks underneath center workspace; sidebar collapses to `200px`.
* **Mobile (`< 768px`)**: Single-column vertical stack; sidebar transitions off-canvas; table enables horizontal swipe.

---

## 8. Client-Side State Management & JavaScript Engine

The client application (`app.js`) is encapsulated inside an Immediately Invoked Function Expression (IIFE) to avoid global namespace pollution:

```javascript
(function () {
  "use strict";
  // Encapsulated state and listeners
})();
```

### State Variables & Storage Keys:
1. `activityLogs`: Array of operational log objects.
   * LocalStorage Key: `"datavault6_activity_logs"`
   * Fallback: Populated with initial seed records (`INITIAL_ACTIVITY_LOGS`) if empty or uninitialized.
2. `currentLogFilter`: Filter state for modal viewer (`"ALL"`, `"UPLOAD"`, `"STORAGE"`, `"QUERY"`, `"COMMENT"`).
3. `datavault6_theme`: Stores selected color mode (`"light"` or `"dark"`).

### Activity Log Data Schema:
```typescript
interface ClientActivityLog {
  id: string;               // e.g. "act-1727394812345"
  timestamp: string;        // ISO 8601 string
  displayTime: string;      // Human-readable relative string ("5 hours ago", "Just now")
  actor: string;            // e.g. "Maria S.", "JLee", "System Engine"
  avatarClass: string;      // CSS class for avatar styling
  avatarInitials: string;   // 2-letter uppercase initials
  actionType: string;       // "UPLOAD" | "STORAGE" | "QUERY" | "COMMENT" | "OPERATION"
  actionText: string;       // Description of action ("uploaded a new dataset", "inspected storage cluster")
  target: string;           // Target resource ("Weather Data 2026", "MySQL")
  details: string;          // Operational details, size, format, cluster partition info
  category: string;         // Matches filter categories
  status: "SUCCESS" | "FAILED";
}
```

### Non-blocking Backend Health Check
On page initialization, `checkBackendHealth()` performs an asynchronous HTTP check:
```javascript
async function checkBackendHealth() {
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      console.log("Connected to DataVault6 backend:", data);
    }
  } catch {
    // Graceful offline/static fallback
  }
}
```

---

## 9. DOM Reference & Technical Specifications

### Key DOM Element Identifiers:
| Element ID | Element Type | Purpose / Description |
| :--- | :--- | :--- |
| `#appLayout` | `<div>` | Top-level grid flex container |
| `#sidebar` | `<aside>` | Left navigation sidebar |
| `#globalSearchInput` | `<input>` | Top command/search bar with live table filtering |
| `#themeToggleBtn` | `<button>` | Dark/Light mode theme switch |
| `#notificationBtn` | `<button>` | Notifications menu toggle |
| `#notificationCount` | `<span>` | Unread notifications badge |
| `#userProfileChip` | `<div>` | Active user identifier and avatar |
| `#kpiTotalDatasets` | `<div>` | Telemetry metric for total dataset count |
| `#kpiTotalContributors` | `<div>` | Telemetry metric for total contributors |
| `#kpiCategories` | `<div>` | Telemetry metric for categories count |
| `#kpiTotalDownloads` | `<div>` | Telemetry metric for cumulative download count |
| `#activityPeriodSelect` | `<select>` | Telemetry chart timeframe selector (7, 14, 30 days) |
| `#activityChartContainer` | `<div>` | SVG Area chart container |
| `#chartTooltip` | `<div>` | Floating hover tooltip for chart data points |
| `#donutTotalDatasets` | `<span>` | Central total readout inside the donut chart |
| `#recentDatasetsTable` | `<table>` | Primary tabular list of recent datasets |
| `#datasetsTableBody` | `<tbody>` | Dynamic table row mount target |
| `#viewAllDatasetsLink` | `<a>` | Resets all table filters to show all datasets |
| `#viewAllDatabasesLink` | `<a>` | Clears database filter and shows all clusters |
| `#btnQuickUpload` | `<button>` | Quick action trigger to open upload modal |
| `#btnQuickExplore` | `<button>` | Quick action trigger to focus search input |
| `#btnQuickMyDatasets` | `<button>` | Quick action trigger to filter user-authored datasets |
| `#btnQuickAnalytics` | `<button>` | Quick action trigger to scroll to analytics charts |
| `#activityFeedList` | `<div>` | Right-rail live operational activity feed |
| `#viewAllActivityLink` | `<a>` | Header link to open activity logs modal |
| `#uploadModal` | `<div>` | Dataset upload modal dialog overlay |
| `#uploadDatasetForm` | `<form>` | Dataset upload form element |
| `#activityLogsModal` | `<div>` | Comprehensive operational activity logs modal viewer |
| `#logsSearchInput` | `<input>` | Search input inside activity logs modal |
| `#fullLogsTable` | `<table>` | Full activity logs data table |
| `#fullLogsTableBody` | `<tbody>` | Dynamic mount for filtered activity logs |
| `#btnSimulateActivity` | `<button>` | Injects simulated operational activity event |
| `#btnExportLogs` | `<button>` | Exports all activity logs to downloadable JSON |
| `#toastContainer` | `<div>` | Floating toast alert container |

---

## 10. Summary & Developer Checklist

The DataVault6 backend-embedded UI delivers:
1. **Zero-Configuration Administration**: Runs directly out of `apps/api/public/` without requiring any secondary dev server or node compile pipeline.
2. **Full Multi-Database Visibility**: Seamlessly integrates all 6 database engines (MySQL, SQLServer, PostgreSQL, MongoDB, Neo4J, CouchBase) with dataset allocation stats, storage footprints, and interactive filtering.
3. **Operational Activity Auditing**: Strictly isolates internal operational workflows from authentication and security streams, providing real-time feed updates, filtering, simulation, and JSON export.
4. **Fluid Aesthetics & Theme Engine**: Fully responsive CSS architecture with light/dark mode persistence, SVG charts, micro-interactions, and accessible typography.
