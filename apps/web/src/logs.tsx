import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listLogs, type LogCategory, type LogRecord } from "./api";
import { useAuth } from "./auth";

const categories: Array<{ key: LogCategory; label: string }> = [
  { key: "login", label: "Login" },
  { key: "audit", label: "Audit" },
  { key: "security", label: "Security" },
  { key: "dataset-activity", label: "Dataset Activity" },
  { key: "database-activity", label: "Database Activity" }
];

function displayValue(value: string | null | undefined): string {
  return value || "-";
}

function LogTable({ items }: { items: LogRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-3">Timestamp</th>
            <th className="px-3 py-3">Actor</th>
            <th className="px-3 py-3">Action</th>
            <th className="px-3 py-3">Result</th>
            <th className="px-3 py-3">IP Address</th>
            <th className="px-3 py-3">Resource</th>
            <th className="px-3 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr className="border-b border-slate-900 text-slate-300" key={item.id}>
              <td className="whitespace-nowrap px-3 py-4">{new Date(item.timestamp).toLocaleString()}</td>
              <td className="px-3 py-4"><span className="text-white">{displayValue(item.actorEmail)}</span><br /><span className="text-xs text-slate-500">{item.actorType}</span></td>
              <td className="px-3 py-4 font-medium text-cyan-200">{item.action}</td>
              <td className={`px-3 py-4 font-semibold ${item.success ? "text-emerald-300" : "text-rose-300"}`}>{item.success ? "Success" : "Failure"}</td>
              <td className="px-3 py-4">{displayValue(item.ipAddress)}</td>
              <td className="px-3 py-4">{displayValue(item.resourceType)}{item.resourceId ? `/${item.resourceId}` : ""}</td>
              <td className="max-w-[260px] px-3 py-4 text-xs text-slate-400">{JSON.stringify(item.metadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LogsPage({ category }: { category: LogCategory }) {
  const { accessToken } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("25");
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [success, setSuccess] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const title = categories.find((entry) => entry.key === category)?.label ?? "Logs";
  const query = { page: String(page), pageSize, ...(search ? { search } : {}), ...(actor ? { actor } : {}), ...(action ? { action } : {}), ...(success ? { success } : {}), ...(start ? { start: new Date(start).toISOString() } : {}), ...(end ? { end: new Date(end).toISOString() } : {}) };
  const logs = useQuery({ queryKey: ["logs", category, query], queryFn: () => listLogs(category, query, accessToken!), enabled: Boolean(accessToken) });

  function resetFilters() {
    setPage(1);
    setSearch("");
    setActor("");
    setAction("");
    setSuccess("");
    setStart("");
    setEnd("");
  }

  return (
    <section className="mt-12 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Read-only history</p>
          <h1 className="mt-2 text-3xl font-bold text-cyan-300">{title} Logs</h1>
        </div>
        <Link className="text-sm text-cyan-300 hover:text-white" to="/logs/login">All logs</Link>
      </div>

      <form className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
        <input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setSearch(event.target.value)} placeholder="Search action or resource" value={search} />
        <input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setActor(event.target.value)} placeholder="Actor email or ID" value={actor} />
        <input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setAction(event.target.value)} placeholder="Action" value={action} />
        <select className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => { setSuccess(event.target.value); setPage(1); }} value={success}>
          <option value="">All results</option><option value="true">Success only</option><option value="false">Failures only</option>
        </select>
        <label className="text-xs text-slate-500">Start<input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => { setStart(event.target.value); setPage(1); }} type="datetime-local" value={start} /></label>
        <label className="text-xs text-slate-500">End<input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => { setEnd(event.target.value); setPage(1); }} type="datetime-local" value={end} /></label>
        <button className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200" type="submit">Apply filters</button>
        <button className="rounded border border-slate-700 px-4 py-2 text-slate-300 hover:text-white" onClick={resetFilters} type="button">Clear</button>
      </form>

      {logs.isError && <p className="mt-6 rounded border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">Logs are temporarily unavailable.</p>}
      {logs.isPending && <p className="mt-8 text-slate-400">Loading logs...</p>}
      {!logs.isPending && logs.data?.items.length === 0 && <p className="mt-8 text-slate-400">No log entries match these filters.</p>}
      {logs.data && logs.data.items.length > 0 && <div className="mt-8"><LogTable items={logs.data.items} /></div>}

      {logs.data && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>{logs.data.total} entries, page {logs.data.page} of {Math.max(logs.data.pageCount, 1)}</span>
          <div className="flex gap-2">
            <select className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" onChange={(event) => { setPageSize(event.target.value); setPage(1); }} value={pageSize}><option value="25">25 / page</option><option value="50">50 / page</option><option value="100">100 / page</option></select>
            <button className="rounded border border-slate-700 px-3 py-1 hover:text-white disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">Previous</button>
            <button className="rounded border border-slate-700 px-3 py-1 hover:text-white disabled:opacity-40" disabled={page >= logs.data.pageCount} onClick={() => setPage((current) => current + 1)} type="button">Next</button>
          </div>
        </div>
      )}
    </section>
  );
}
