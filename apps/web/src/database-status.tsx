import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getDatabaseStatuses } from "./api";
import { useAuth } from "./auth";

export function DatabaseStatusPage() {
  const { accessToken } = useAuth();
  const statuses = useQuery({
    queryKey: ["database-statuses"],
    queryFn: () => getDatabaseStatuses(accessToken!),
    enabled: Boolean(accessToken)
  });

  return (
    <section className="mt-12 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl">
      <Link className="text-sm text-cyan-300 hover:text-white" to="/dashboard">&lt;- Back to Dashboard</Link>
      <div className="mt-6">
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Infrastructure readiness</p>
        <h1 className="mt-2 text-3xl font-bold text-cyan-300">Database Status</h1>
       <p className="mt-3 max-w-2xl text-sm text-slate-400">Dataset storage engines are listed below. Status reflects backend configuration only; connection details and credentials are never displayed.</p>
      </div>
      {statuses.isPending && <p className="mt-8 text-slate-400">Loading database status...</p>}
      {statuses.isError && <p className="mt-8 text-rose-200">Database status is temporarily unavailable.</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
       {statuses.data?.map((database) => (
         <article className="rounded border border-slate-800 bg-slate-900/60 p-5" key={database.engine}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">{database.displayName}</h2>
              <span className={`rounded-full border px-2 py-1 text-xs ${database.status === "configured" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : database.status === "unavailable" ? "border-rose-300/30 bg-rose-400/10 text-rose-200" : "border-amber-300/30 bg-amber-400/10 text-amber-200"}`}>{database.status === "configured" ? "Configured" : database.status === "not_configured" ? "Not Configured" : "Unavailable"}</span>
            </div>
            <dl className="mt-5 space-y-3 text-sm text-slate-300">
              <div><dt className="text-slate-500">Database type</dt><dd>{database.databaseType}</dd></div>
              <div><dt className="text-slate-500">Data model</dt><dd>{database.dataModels.join(" / ")}</dd></div>
              <div><dt className="text-slate-500">Storage concept</dt><dd>{database.storageConcept}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
