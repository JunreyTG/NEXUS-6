/**
 * DATAVAULT6 - Frontend Client Application
 * Centralized Dataset Collection & Activity Logging System
 */

(function () {
  "use strict";

  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================

  // Initial System Activity Logs (Strictly operational events, NO login/logout records)
  const INITIAL_ACTIVITY_LOGS = [
    {
      id: "act-1",
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      displayTime: "5 hours ago",
      actor: "Maria S.",
      avatarClass: "avatar-maria",
      avatarInitials: "MS",
      actionType: "UPLOAD",
      actionText: "uploaded a new dataset",
      target: "Weather Data 2026",
      details: "45.2 MB XLSX file ingested into PostgreSQL",
      category: "UPLOAD",
      status: "SUCCESS"
    },
    {
      id: "act-2",
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      displayTime: "1 day ago",
      actor: "Rizal T.",
      avatarClass: "avatar-rizal",
      avatarInitials: "RT",
      actionType: "UPLOAD",
      actionText: "uploaded a dataset",
      target: "Traffic Accident Records",
      details: "12.8 MB CSV file ingested into SQLServer",
      category: "UPLOAD",
      status: "SUCCESS"
    },
    {
      id: "act-3",
      timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      displayTime: "2 days ago",
      actor: "Ana P.",
      avatarClass: "avatar-ana",
      avatarInitials: "AP",
      actionType: "UPLOAD",
      actionText: "uploaded a new dataset",
      target: "Population Statistics",
      details: "8.4 MB JSON document ingested into MongoDB",
      category: "UPLOAD",
      status: "SUCCESS"
    },
    {
      id: "act-4",
      timestamp: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
      displayTime: "2 days ago",
      actor: "Carlos M.",
      avatarClass: "avatar-carlos",
      avatarInitials: "CM",
      actionType: "COMMENT",
      actionText: "commented on a dataset",
      target: "Sales Report 2026",
      details: "Added metadata annotation: Verified Q3 regional reconciliation totals",
      category: "COMMENT",
      status: "SUCCESS"
    },
    {
      id: "act-5",
      timestamp: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
      displayTime: "3 days ago",
      actor: "JLee",
      avatarClass: "avatar-john",
      avatarInitials: "JL",
      actionType: "STORAGE",
      actionText: "provisioned storage partition",
      target: "MySQL",
      details: "Allocated dedicated InnoDB tablespace with 10GB quota",
      category: "STORAGE",
      status: "SUCCESS"
    },
    {
      id: "act-6",
      timestamp: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
      displayTime: "3 days ago",
      actor: "System Engine",
      avatarClass: "avatar-john",
      avatarInitials: "SE",
      actionType: "QUERY",
      actionText: "generated analytical summary",
      target: "Dataset Compatibility Matrix",
      details: "Engine capability matching executed for 1,248 dataset profiles",
      category: "QUERY",
      status: "SUCCESS"
    }
  ];

  // Retrieve stored activity logs or initialize with defaults
  let activityLogs = [];
  try {
    const cached = localStorage.getItem("datavault6_activity_logs_v2");
    activityLogs = cached ? JSON.parse(cached) : INITIAL_ACTIVITY_LOGS;
  } catch {
    activityLogs = INITIAL_ACTIVITY_LOGS;
  }

  // Active filter for activity modal
  let currentLogFilter = "ALL";

  // =========================================================================
  // CORE ACTIVITY LOGGING ENGINE
  // =========================================================================

  /**
   * Record a new system operational activity log.
   * NOTE: This explicitly tracks system activity (upload, query, storage, export, comment)
   * and isolates user authentication (login/logout) events into separate security streams.
   */
  function recordSystemActivity(actor, actionType, actionText, target, details, category) {
    const newLog = {
      id: "act-" + Date.now(),
      timestamp: new Date().toISOString(),
      displayTime: "Just now",
      actor: actor || "JLee",
      avatarClass: "avatar-john",
      avatarInitials: (actor || "JL").slice(0, 2).toUpperCase(),
      actionType: actionType || "OPERATION",
      actionText: actionText || "performed system operation",
      target: target || "System",
      details: details || "Operation completed successfully.",
      category: category || "STORAGE",
      status: "SUCCESS"
    };

    // Prepend to list
    activityLogs.unshift(newLog);

    // Save to localStorage
    try {
      localStorage.setItem("datavault6_activity_logs", JSON.stringify(activityLogs));
    } catch (e) {
      console.warn("Storage quota exceeded", e);
    }

    // Refresh UI components
    renderActivityFeed();
    if (document.getElementById("activityLogsModal").style.display === "flex") {
      renderFullLogsTable();
    }

    showToast(`Activity recorded: ${newLog.actionText} "${newLog.target}"`);
  }

  // =========================================================================
  // RENDERERS
  // =========================================================================

  function renderActivityFeed() {
    const container = document.getElementById("activityFeedList");
    if (!container) return;

    // Show top 4 most recent activity logs (matching screenshot layout)
    const recent = activityLogs.slice(0, 4);

    container.innerHTML = recent.map(log => `
      <div class="activity-item" data-id="${log.id}">
        <div class="activity-avatar ${log.avatarClass || 'avatar-john'}">${log.avatarInitials}</div>
        <div class="activity-info">
          <div class="activity-text">
            <strong>${log.actor}</strong> ${log.actionText} <span class="activity-target">${log.target}</span>
          </div>
          <div class="activity-time">${log.displayTime}</div>
        </div>
      </div>
    `).join("");
  }

  function renderFullLogsTable() {
    const tbody = document.getElementById("fullLogsTableBody");
    const countInfo = document.getElementById("logsCountInfo");
    const searchFilter = (document.getElementById("logsSearchInput")?.value || "").toLowerCase().trim();
    if (!tbody) return;

    const filtered = activityLogs.filter(log => {
      const matchesCategory = currentLogFilter === "ALL" || log.category === currentLogFilter;
      const matchesSearch = !searchFilter ||
        log.actor.toLowerCase().includes(searchFilter) ||
        log.target.toLowerCase().includes(searchFilter) ||
        log.details.toLowerCase().includes(searchFilter) ||
        log.actionType.toLowerCase().includes(searchFilter);
      return matchesCategory && matchesSearch;
    });

    if (countInfo) {
      countInfo.textContent = `Showing ${filtered.length} recorded system activities (${activityLogs.length} total)`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No internal system activity logs found matching the filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(log => {
      let badgeClass = "action-system";
      if (log.category === "UPLOAD") badgeClass = "action-upload";
      else if (log.category === "STORAGE") badgeClass = "action-storage";
      else if (log.category === "QUERY") badgeClass = "action-query";
      else if (log.category === "COMMENT") badgeClass = "action-comment";

      const formattedTime = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        " (" + log.displayTime + ")";

      return `
        <tr>
          <td style="color: var(--text-muted); font-size: 11px; white-space: nowrap;">${formattedTime}</td>
          <td><strong>${log.actor}</strong></td>
          <td><span class="action-badge ${badgeClass}">${log.actionType}</span></td>
          <td><strong style="color: var(--primary-600);">${log.target}</strong></td>
          <td style="color: var(--text-secondary); max-width: 320px;">${log.details}</td>
          <td><span class="status-badge">&bull; ${log.status}</span></td>
        </tr>
      `;
    }).join("");
  }

  // =========================================================================
  // TOAST NOTIFICATION
  // =========================================================================

  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // =========================================================================
  // GLOBAL SEARCH & TABLE FILTERING
  // =========================================================================

  function initGlobalSearch() {
    const searchInput = document.getElementById("globalSearchInput");
    const tableBody = document.getElementById("datasetsTableBody");
    if (!searchInput || !tableBody) return;

    searchInput.addEventListener("input", function (e) {
      const query = e.target.value.toLowerCase().trim();
      const rows = tableBody.querySelectorAll("tr");

      let matches = 0;
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (!query || text.includes(query)) {
          row.style.display = "";
          matches++;
        } else {
          row.style.display = "none";
        }
      });
    });

    // Keyboard shortcut: Ctrl + K (or Cmd + K) focuses search
    window.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.focus();
        showToast("Search focused (Ctrl+K)");
      }
    });
  }

  // =========================================================================
  // UPLOAD DATASET MODAL
  // =========================================================================

  function initUploadModal() {
    const uploadModal = document.getElementById("uploadModal");
    const btnQuickUpload = document.getElementById("btnQuickUpload");
    const navUpload = document.getElementById("nav-upload");
    const closeUploadModal = document.getElementById("closeUploadModal");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");
    const uploadForm = document.getElementById("uploadDatasetForm");

    const openModal = (e) => {
      if (e) e.preventDefault();
      uploadModal.style.display = "flex";
      document.getElementById("datasetNameInput").focus();
    };

    const closeModal = () => {
      uploadModal.style.display = "none";
      uploadForm.reset();
    };

    if (btnQuickUpload) btnQuickUpload.addEventListener("click", openModal);
    if (navUpload) navUpload.addEventListener("click", openModal);
    if (closeUploadModal) closeUploadModal.addEventListener("click", closeModal);
    if (cancelUploadBtn) cancelUploadBtn.addEventListener("click", closeModal);

    uploadModal.addEventListener("click", function (e) {
      if (e.target === uploadModal) closeModal();
    });

    if (uploadForm) {
      uploadForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const name = document.getElementById("datasetNameInput").value.trim();
        const desc = document.getElementById("datasetDescInput").value.trim();
        const category = document.getElementById("datasetCategoryInput").value;
        const targetDb = document.getElementById("datasetTargetDbInput").value;
        const format = document.getElementById("datasetFormatInput").value;
        const size = document.getElementById("datasetSizeInput").value.trim() || "10.0 MB";

        // Set database name and badge
        let dbName = targetDb || "MySQL";
        let dbBadgeClass = "badge-db01";
        if (dbName === "SQLServer") dbBadgeClass = "badge-db02";
        else if (dbName === "PostgreSQL") dbBadgeClass = "badge-db03";
        else if (dbName === "MongoDB") dbBadgeClass = "badge-db04";
        else if (dbName === "Neo4J") dbBadgeClass = "badge-db05";
        else if (dbName === "CouchBase") dbBadgeClass = "badge-db06";

        // Insert new row into the table at top
        const tableBody = document.getElementById("datasetsTableBody");
        if (tableBody) {
          const newRow = document.createElement("tr");
          newRow.dataset.name = name;
          newRow.dataset.db = dbName;

          let formatClass = "badge-format-csv";
          if (format === "XLSX") formatClass = "badge-format-xlsx";
          if (format === "JSON") formatClass = "badge-format-json";

          newRow.innerHTML = `
            <td>
              <div class="dataset-name-cell">
                <div class="doc-icon icon-blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div class="dataset-meta">
                  <div class="dataset-title">${name}</div>
                  <div class="dataset-desc">${desc}</div>
                </div>
              </div>
            </td>
            <td><span class="badge ${dbBadgeClass}">${dbName}</span></td>
            <td><span class="category-text">${category}</span></td>
            <td><span class="badge ${formatClass}">${format}</span></td>
            <td><span class="size-text">${size}</span></td>
            <td>
              <div class="contributor-cell">
                <span class="avatar-small avatar-john">JL</span>
                <span class="contributor-name">JLee</span>
              </div>
            </td>
            <td><span class="time-text">Just now</span></td>
            <td>
              <button class="action-dots-btn" aria-label="Dataset Actions">&vellip;</button>
            </td>
          `;

          tableBody.prepend(newRow);
        }

        // Increment KPI Total Datasets
        const kpiDatasets = document.getElementById("kpiTotalDatasets");
        const donutTotal = document.getElementById("donutTotalDatasets");
        if (kpiDatasets) {
          const current = parseInt(kpiDatasets.textContent.replace(/,/g, ""), 10) || 1248;
          const next = (current + 1).toLocaleString();
          kpiDatasets.textContent = next;
          if (donutTotal) donutTotal.textContent = next;
        }

        // RECORD INTERNAL SYSTEM ACTIVITY LOG!
        recordSystemActivity(
          "JLee",
          "UPLOAD",
          "uploaded a new dataset",
          name,
          `${size} ${format} file ingested into ${targetDb}. Category: ${category}`,
          "UPLOAD"
        );

        closeModal();
      });
    }
  }

  // =========================================================================
  // SYSTEM ACTIVITY LOGS MODAL VIEWER
  // =========================================================================

  function initActivityLogsModal() {
    const modal = document.getElementById("activityLogsModal");
    const openBtn = document.getElementById("viewAllActivityLink");
    const closeBtn = document.getElementById("closeActivityLogsModal");
    const simulateBtn = document.getElementById("btnSimulateActivity");
    const exportBtn = document.getElementById("btnExportLogs");
    const searchInput = document.getElementById("logsSearchInput");

    const openModal = (e) => {
      if (e) e.preventDefault();
      modal.style.display = "flex";
      renderFullLogsTable();
    };

    const closeModal = () => {
      modal.style.display = "none";
    };

    if (openBtn) openBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

    // Filter Chips
    document.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", function () {
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        this.classList.add("active");
        currentLogFilter = this.dataset.filter || "ALL";
        renderFullLogsTable();
      });
    });

    // Search filter input
    if (searchInput) {
      searchInput.addEventListener("input", () => renderFullLogsTable());
    }

    // Simulate Activity button
    if (simulateBtn) {
      simulateBtn.addEventListener("click", () => {
        const samples = [
          { actor: "JLee", action: "QUERY", text: "executed SQL aggregation query", target: "MySQL", details: "Scanned 125,000 records on table `student_records` (0.04s)", cat: "QUERY" },
          { actor: "Maria S.", action: "STORAGE", text: "re-indexed spatial location index", target: "PostgreSQL", details: "Spatial GeoJSON boundary index rebuilt successfully", cat: "STORAGE" },
          { actor: "Carlos M.", action: "COMMENT", text: "validated schema constraints", target: "Sales Report 2026", details: "All numeric field thresholds verified against Q3 ledger", cat: "COMMENT" },
          { actor: "Rizal T.", action: "UPLOAD", text: "synchronized incremental batch", target: "Traffic Accident Records", details: "Appended 450 new incident markers from GIS sensor feed", cat: "UPLOAD" }
        ];
        const chosen = samples[Math.floor(Math.random() * samples.length)];
        recordSystemActivity(chosen.actor, chosen.action, chosen.text, chosen.target, chosen.details, chosen.cat);
      });
    }

    // Export Logs JSON
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activityLogs, null, 2));
        const dlAnchor = document.createElement("a");
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `DataVault6_System_Activity_Logs_${Date.now()}.json`);
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
        showToast("System Activity Logs exported as JSON");
      });
    }
  }

  // =========================================================================
  // INTERACTIVE DATABASE CARDS
  // =========================================================================

  function initDatabaseCenter() {
    const exploreButtons = document.querySelectorAll(".btn-db-explore");
    const tableBody = document.getElementById("datasetsTableBody");

    exploreButtons.forEach(btn => {
      btn.addEventListener("click", function () {
        const dbName = this.dataset.exploreDb;

        // Filter recent datasets table
        if (tableBody) {
          const rows = tableBody.querySelectorAll("tr");
          let matchCount = 0;
          rows.forEach(row => {
            if (row.dataset.db === dbName) {
              row.style.display = "";
              matchCount++;
            } else {
              row.style.display = "none";
            }
          });
          showToast(`Filtered datasets for ${dbName} (${matchCount} found)`);
        }

        // Record Activity Log
        recordSystemActivity(
          "JLee",
          "STORAGE",
          "inspected storage cluster",
          dbName,
          `Connection verified and partition schema inspected for ${dbName}`,
          "STORAGE"
        );
      });
    });

    // View All Databases Link
    const viewAllDatabasesLink = document.getElementById("viewAllDatabasesLink");
    if (viewAllDatabasesLink) {
      viewAllDatabasesLink.addEventListener("click", (e) => {
        e.preventDefault();
        // Reset table filters
        if (tableBody) {
          tableBody.querySelectorAll("tr").forEach(r => r.style.display = "");
        }
        showToast("Displaying all Database clusters");
      });
    }

    // View All Datasets Link
    const viewAllDatasetsLink = document.getElementById("viewAllDatasetsLink");
    if (viewAllDatasetsLink) {
      viewAllDatasetsLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (tableBody) {
          tableBody.querySelectorAll("tr").forEach(r => r.style.display = "");
        }
        showToast("Reset dataset filters to show all");
      });
    }
  }

  // =========================================================================
  // QUICK ACTIONS
  // =========================================================================

  function initQuickActions() {
    // Explore Datasets
    const btnExplore = document.getElementById("btnQuickExplore");
    if (btnExplore) {
      btnExplore.addEventListener("click", () => {
        const searchInput = document.getElementById("globalSearchInput");
        if (searchInput) {
          searchInput.focus();
          showToast("Search active - enter keywords to explore");
        }
      });
    }

    // My Datasets
    const btnMyDatasets = document.getElementById("btnQuickMyDatasets");
    if (btnMyDatasets) {
      btnMyDatasets.addEventListener("click", () => {
        const tableBody = document.getElementById("datasetsTableBody");
        if (tableBody) {
          const rows = tableBody.querySelectorAll("tr");
          rows.forEach(row => {
            const isUser = row.innerText.includes("John D.") || row.innerText.includes("JLee");
            row.style.display = isUser ? "" : "none";
          });
          showToast("Filtered: Showing datasets contributed by JLee");
          recordSystemActivity("JLee", "QUERY", "filtered contributor workspace", "My Datasets", "Displaying datasets authored by JLee", "QUERY");
        }
      });
    }

    // View Analytics
    const btnAnalytics = document.getElementById("btnQuickAnalytics");
    if (btnAnalytics) {
      btnAnalytics.addEventListener("click", () => {
        const chartCard = document.querySelector(".charts-row");
        if (chartCard) {
          chartCard.scrollIntoView({ behavior: "smooth", block: "center" });
          showToast("Analytics charts highlighted");
          recordSystemActivity("JLee", "QUERY", "viewed system analytics", "Dataset Activity Chart", "Rendered 7-day ingestion and database distribution metrics", "QUERY");
        }
      });
    }
  }

  // =========================================================================
  // CHART TOOLTIPS & TIMEFRAME SELECTOR
  // =========================================================================

  function initChartInteractions() {
    const dots = document.querySelectorAll(".chart-dot");
    const tooltip = document.getElementById("chartTooltip");
    const container = document.getElementById("activityChartContainer");

    dots.forEach(dot => {
      dot.addEventListener("mouseenter", function (e) {
        if (!tooltip) return;
        const val = this.dataset.val;
        const date = this.dataset.date;
        tooltip.innerHTML = `<strong>${date}</strong>: ${val} activities`;
        tooltip.style.display = "block";

        const rect = this.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        tooltip.style.left = `${rect.left - containerRect.left - 30}px`;
        tooltip.style.top = `${rect.top - containerRect.top - 36}px`;
      });

      dot.addEventListener("mouseleave", function () {
        if (tooltip) tooltip.style.display = "none";
      });
    });

    const periodSelect = document.getElementById("activityPeriodSelect");
    if (periodSelect) {
      periodSelect.addEventListener("change", function () {
        showToast(`Chart updated to last ${this.value} days`);
        recordSystemActivity("JLee", "QUERY", "adjusted telemetry timeframe", "Dataset Activity", `Time horizon set to ${this.value} days`, "QUERY");
      });
    }

    // Donut chart segment hover & clicks
    const segments = document.querySelectorAll(".donut-segment");
    segments.forEach(seg => {
      seg.addEventListener("mouseenter", function () {
        const db = this.dataset.db;
        const count = this.dataset.count;
        if (tooltip) {
          tooltip.innerHTML = `<strong>${db}</strong>: ${count}`;
          tooltip.style.display = "block";
          tooltip.style.left = "45%";
          tooltip.style.top = "40%";
        }
      });
      seg.addEventListener("mouseleave", function () {
        if (tooltip) tooltip.style.display = "none";
      });
    });
  }

  // =========================================================================
  // THEME TOGGLE (DARK / LIGHT MODE)
  // =========================================================================

  function initThemeToggle() {
    const toggleBtn = document.getElementById("themeToggleBtn");
    const savedTheme = localStorage.getItem("datavault6_theme") || "light";

    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const nextTheme = isDark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("datavault6_theme", nextTheme);
        showToast(`Theme switched to ${nextTheme} mode`);
      });
    }
  }

  // =========================================================================
  // SIDEBAR NAVIGATION HIGHLIGHTS
  // =========================================================================

  function initSidebarNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => {
      item.addEventListener("click", function (e) {
        if (this.getAttribute("href")?.startsWith("#")) {
          e.preventDefault();
        }
        navItems.forEach(n => n.classList.remove("active"));
        this.classList.add("active");

        const label = this.querySelector(".nav-label")?.textContent || "Navigation";
        if (this.dataset.db) {
          // Clicked a database item in sidebar
          const dbName = this.dataset.db;
          const tableBody = document.getElementById("datasetsTableBody");
          if (tableBody) {
            tableBody.querySelectorAll("tr").forEach(r => {
              r.style.display = r.dataset.db === dbName ? "" : "none";
            });
          }
          showToast(`Filtered datasets for ${dbName}`);
          recordSystemActivity("JLee", "STORAGE", "navigated to database", dbName, `Sidebar selection: viewing ${dbName} datasets`, "STORAGE");
        } else if (label === "Dashboard") {
          // Reset table
          const tableBody = document.getElementById("datasetsTableBody");
          if (tableBody) {
            tableBody.querySelectorAll("tr").forEach(r => r.style.display = "");
          }
        }
      });
    });
  }

  // =========================================================================
  // BACKEND INTEGRATION ATTEMPT (Non-blocking)
  // =========================================================================

  async function checkBackendHealth() {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        console.log("Connected to DataVault6 backend:", data);
      }
    } catch {
      // Backend running in offline/static mode
    }
  }

  // =========================================================================
  // INITIALIZATION ON DOM READY
  // =========================================================================

  document.addEventListener("DOMContentLoaded", function () {
    renderActivityFeed();
    initGlobalSearch();
    initUploadModal();
    initActivityLogsModal();
    initDatabaseCenter();
    initQuickActions();
    initChartInteractions();
    initThemeToggle();
    initSidebarNavigation();
    checkBackendHealth();

    console.log("DataVault6 System initialized with Operational Activity Logging.");
  });

})();
