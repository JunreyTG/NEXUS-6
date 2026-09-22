import { useState, type FormEvent } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getApiHealth, getDatabaseHealth, getPublicStatistics } from "./api";
import { loginErrorMessage, useAuth } from "./auth";
import { AdminManagementPage, CreateAdminPage } from "./admin-management";
import { SetPasswordPage, VerifyEmailPage } from "./verification";
import { LogsPage } from "./logs";
import { DatasetDetailPage, DatasetListPage, DatasetUploadPage } from "./datasets";
import { DatabaseStatusPage } from "./database-status";
import { DatasetRecordsPage } from "./records";
import { ReportCreatePage, ReportDetailPage, ReportListPage } from "./reports";
import { AboutPage, PublicDatasetDetailPage, PublicDatasetsPage, PublicReportDetailPage, PublicReportsPage, TechnologiesPage } from "./public-portal";

function PublicLayout() {
  const { status, user } = useAuth();
  return <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-center justify-between gap-5 border-b border-white/10 pb-5"><Link className="text-lg font-bold tracking-[0.25em] text-cyan-300" to="/">NEXUS-6</Link><nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300"><NavLink end className={({ isActive }) => isActive ? "text-cyan-300" : "hover:text-white"} to="/">Home</NavLink><NavLink className={({ isActive }) => isActive ? "text-cyan-300" : "hover:text-white"} to="/datasets">Datasets</NavLink><NavLink className={({ isActive }) => isActive ? "text-cyan-300" : "hover:text-white"} to="/reports">Reports</NavLink><NavLink className={({ isActive }) => isActive ? "text-cyan-300" : "hover:text-white"} to="/technologies">Technologies</NavLink><NavLink className={({ isActive }) => isActive ? "text-cyan-300" : "hover:text-white"} to="/about">About</NavLink>{status === "authenticated" ? <><span className="text-xs text-slate-500">{user?.role}</span><Link className="text-cyan-200 hover:text-white" to="/dashboard">Admin workspace</Link></> : <NavLink className={({ isActive }) => isActive ? "text-cyan-300" : "hover:text-white"} to="/login">Admin login</NavLink>}</nav></header><Outlet /></div></main>;
}

function AdminLayout() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link className="text-lg font-bold tracking-wide text-cyan-300" to="/">
            NEXUS-6
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-300">
            <NavLink end className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/">
              Home
            </NavLink>
            {status === "authenticated" && (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/dashboard">
                Dashboard
              </NavLink>
            )}
            {status === "authenticated" && (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/datasets">
                Datasets
              </NavLink>
            )}
            {status === "authenticated" && (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/reports">
                Reports
              </NavLink>
            )}
            {status === "authenticated" && user?.role === "SUPER_ADMIN" && (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/admin-management">
                Admins
              </NavLink>
            )}
            {status === "authenticated" && user?.role === "SUPER_ADMIN" && (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/databases/status">
                Databases
              </NavLink>
            )}
            {status === "authenticated" && (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/logs/login">
                Logs
              </NavLink>
            )}
            {status !== "authenticated" ? (
              <NavLink className={({ isActive }) => (isActive ? "text-cyan-300" : "hover:text-white")} to="/login">
                Login
              </NavLink>
            ) : (
              <button className="hover:text-white" onClick={() => void handleLogout()} type="button">
                Logout
              </button>
            )}
          </nav>
        </header>
        {user && status === "authenticated" && (
          <p className="mt-4 text-right text-xs uppercase tracking-[0.2em] text-slate-500">{user.role}</p>
        )}
        <Outlet />
      </div>
    </main>
  );
}

function AppLayout() {
  const { status } = useAuth();
  const location = useLocation();
  const adminPath = ["/dashboard", "/admin-management", "/databases", "/logs", "/datasets/upload"].some((path) => location.pathname.startsWith(path))
    || (status === "authenticated" && (location.pathname === "/datasets" || location.pathname.startsWith("/datasets/") || location.pathname === "/reports" || location.pathname.startsWith("/reports/") || location.pathname === "/reports/create"));
  return adminPath ? <AdminLayout /> : <PublicLayout />;
}

type Status = "checking" | "online" | "offline";

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    checking: "border border-cyan-300/30 bg-cyan-400/10 text-cyan-300",
    online: "border border-emerald-300/30 bg-emerald-400/10 text-emerald-300",
    offline: "border border-rose-300/30 bg-rose-400/10 text-rose-300"
  };
  const labels: Record<Status, string> = {
    checking: "Checking Backend",
    online: "Backend Online",
    offline: "Backend Unavailable"
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function HomePage() {
  const backendHealth = useQuery({
    queryKey: ["health", "api"],
    queryFn: getApiHealth,
    refetchInterval: 30_000
  });
  const databaseHealth = useQuery({
    queryKey: ["health", "database"],
    queryFn: getDatabaseHealth,
    refetchInterval: 30_000
  });
  const statistics = useQuery({ queryKey: ["public-statistics"], queryFn: getPublicStatistics });

  const backendStatus: Status = backendHealth.isPending
    ? "checking"
    : backendHealth.isSuccess
      ? "online"
      : "offline";
  const databaseStatus = databaseHealth.isPending
    ? "Checking System Database"
    : databaseHealth.data?.status === "ok"
      ? "System Database Connected"
      : "System Database Unavailable";

  return (
    <>
    <section className="relative mt-14 overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-7 shadow-2xl sm:p-12">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusPill status={backendStatus} />
        <span className="text-sm text-slate-300" role="status">
          {databaseStatus}
        </span>
      </div>
      <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Public data intelligence</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-bold tracking-tight text-white sm:text-7xl">A clearer map of your data universe.</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Discover approved datasets and reports, understand their shape, and see how NEXUS-6 routes them across database technologies.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="rounded bg-cyan-300 px-5 py-3 font-semibold text-slate-950" to="/datasets">Explore datasets</Link><Link className="rounded border border-cyan-300/30 px-5 py-3 font-semibold text-cyan-200" to="/about">How it works</Link></div>
    </section>
    <section className="mt-5 grid gap-4 sm:grid-cols-3">{[["Datasets", statistics.data?.datasets ?? "-"], ["Reports", statistics.data?.reports ?? "-"], ["Engine families", 6]].map(([label, value]) => <div className="border border-white/10 bg-slate-950/50 p-5" key={String(label)}><p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-cyan-300">{value}</p></div>)}</section>
    </>
  );
}

function DatasetPortalRoute() {
  const { status } = useAuth();
  return status === "authenticated" ? <DatasetListPage /> : <PublicDatasetsPage />;
}

function DatasetDetailPortalRoute() {
  const { status } = useAuth();
  return status === "authenticated" ? <DatasetDetailPage /> : <PublicDatasetDetailPage />;
}

function ReportPortalRoute() {
  const { status } = useAuth();
  return status === "authenticated" ? <ReportListPage /> : <PublicReportsPage />;
}

function ReportDetailPortalRoute() {
  const { status } = useAuth();
  return status === "authenticated" ? <ReportDetailPage /> : <PublicReportDetailPage />;
}

function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate replace to="/dashboard" />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto mt-16 max-w-md rounded-lg border border-cyan-400/20 bg-slate-950/70 p-8 shadow-2xl">
      <h1 className="text-3xl font-bold text-cyan-300">Admin Login</h1>
      <p className="mt-3 text-sm text-slate-400">Use your NEXUS-6 administrator credentials.</p>
      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm text-slate-300">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block text-sm text-slate-300">
          Password
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error && <p className="rounded border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <button
          className="w-full rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function ProtectedRoute() {
  const { status } = useAuth();
  if (status === "loading") {
    return <p className="mt-16 text-center text-slate-400">Checking session...</p>;
  }
  return status === "authenticated" ? <Outlet /> : <Navigate replace to="/login" />;
}

function SuperAdminRoute() {
  const { status, user } = useAuth();
  if (status === "loading") return <p className="mt-16 text-center text-slate-400">Checking session...</p>;
  if (status !== "authenticated") return <Navigate replace to="/login" />;
  return user?.role === "SUPER_ADMIN" ? <Outlet /> : <Navigate replace to="/dashboard" />;
}

function DashboardPage() {
  const { user } = useAuth();
  return (
    <section className="mt-16 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-8 shadow-2xl">
      <p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Authenticated workspace</p>
      <h1 className="mt-3 text-4xl font-bold text-cyan-300">NEXUS-6 Dashboard</h1>
      <p className="mt-8 text-slate-300">
        Logged in as: <span className="font-semibold text-white">{user?.role}</span>
      </p>
      <p className="mt-2 text-sm text-slate-500">{user?.email}</p>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="technologies" element={<TechnologiesPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="set-password" element={<SetPasswordPage />} />
        <Route path="datasets" element={<DatasetPortalRoute />} />
        <Route path="datasets/:id" element={<DatasetDetailPortalRoute />} />
        <Route path="reports" element={<ReportPortalRoute />} />
        <Route path="reports/:id" element={<ReportDetailPortalRoute />} />
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
        <Route element={<SuperAdminRoute />}>
          <Route path="admin-management" element={<AdminManagementPage />} />
          <Route path="admin-management/create" element={<CreateAdminPage />} />
          <Route path="databases/status" element={<DatabaseStatusPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="logs/login" element={<LogsPage category="login" />} />
          <Route path="logs/audit" element={<LogsPage category="audit" />} />
          <Route path="logs/security" element={<LogsPage category="security" />} />
          <Route path="logs/dataset-activity" element={<LogsPage category="dataset-activity" />} />
          <Route path="logs/database-activity" element={<LogsPage category="database-activity" />} />
          <Route path="datasets/upload" element={<DatasetUploadPage />} />
          <Route path="datasets/:id/records" element={<DatasetRecordsPage />} />
          <Route path="reports/create" element={<ReportCreatePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
