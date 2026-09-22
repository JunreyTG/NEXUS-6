import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicDataset, getPublicReport, listPublicDatasets, listPublicReports, type PublicDataset, type PublicReport } from "./api";

const engines = ["MongoDB", "MySQL", "PostgreSQL", "Couchbase", "Neo4j", "SQL Server"];

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-cyan-300/15 bg-slate-950/65 p-6 shadow-2xl shadow-cyan-950/20 ${className}`}>{children}</section>;
}

function EngineBadge({ value }: { value: string | null }) {
  return <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-200">{value ?? "Unassigned"}</span>;
}

export function AboutPage() {
  return <Panel className="mt-14"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">Public mission</p><h1 className="mt-3 text-4xl font-bold text-white">Make data infrastructure legible.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">NEXUS-6 gives teams one public-facing catalog for datasets, reports, and the storage technologies behind them. It keeps operational controls private while making approved knowledge easy to discover.</p><div className="mt-10 grid gap-4 md:grid-cols-3"><div><p className="text-2xl font-semibold text-cyan-300">01</p><p className="mt-2 text-sm text-slate-400">Describe data once, independent of vendor.</p></div><div><p className="text-2xl font-semibold text-cyan-300">02</p><p className="mt-2 text-sm text-slate-400">Publish only the metadata and reports marked public.</p></div><div><p className="text-2xl font-semibold text-cyan-300">03</p><p className="mt-2 text-sm text-slate-400">Keep credentials, paths, and administration behind the boundary.</p></div></div></Panel>;
}

export function TechnologiesPage() {
  return <Panel className="mt-14"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">Storage map</p><h1 className="mt-3 text-4xl font-bold text-white">Six engines. One neutral model.</h1><p className="mt-4 max-w-2xl text-slate-400">NEXUS-6 can route datasets to different database families without exposing connection details in the public portal.</p><div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{engines.map((engine, index) => <div className="border-l border-cyan-300/50 bg-slate-900/60 p-5" key={engine}><p className="text-xs text-cyan-300/60">0{index + 1}</p><h2 className="mt-3 text-xl font-semibold text-white">{engine}</h2><p className="mt-2 text-sm text-slate-400">Engine-neutral dataset storage and reporting adapter.</p></div>)}</div></Panel>;
}

export function PublicDatasetsPage() {
  const datasets = useQuery({ queryKey: ["public-datasets"], queryFn: () => listPublicDatasets() });
  return <Panel className="mt-14"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">Public catalog</p><h1 className="mt-3 text-4xl font-bold text-white">Datasets</h1></div><span className="text-sm text-slate-500">{datasets.data?.total ?? 0} published</span></div>{datasets.isPending && <p className="mt-10 text-slate-400">Loading catalog...</p>}{datasets.isError && <p className="mt-10 text-rose-200">The public catalog is temporarily unavailable.</p>}<div className="mt-10 grid gap-4 lg:grid-cols-2">{datasets.data?.items.map((dataset) => <DatasetCard dataset={dataset} key={dataset.id} />)}</div>{datasets.data?.items.length === 0 && <p className="mt-10 text-slate-400">No public datasets are available.</p>}</Panel>;
}

function DatasetCard({ dataset }: { dataset: PublicDataset }) {
  return <Link className="group rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/50" to={`/datasets/${dataset.id}`}><div className="flex items-start justify-between gap-4"><h2 className="text-xl font-semibold text-white group-hover:text-cyan-200">{dataset.name}</h2><EngineBadge value={dataset.selectedEngine ?? dataset.recommendedEngine} /></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{dataset.description || "No public description provided."}</p><div className="mt-5 flex gap-5 text-xs text-slate-500"><span>{dataset.classification}</span><span>{dataset.recordCount ?? "-"} records</span></div></Link>;
}

export function PublicDatasetDetailPage() {
  const { id = "" } = useParams();
  const dataset = useQuery({ queryKey: ["public-dataset", id], queryFn: () => getPublicDataset(id), enabled: Boolean(id) });
  return <Panel className="mt-14">{dataset.isPending && <p className="text-slate-400">Loading dataset...</p>}{dataset.isError && <p className="text-rose-200">This public dataset could not be found.</p>}{dataset.data && <><Link className="text-sm text-cyan-300" to="/datasets">&lt;- Back to datasets</Link><p className="mt-8 text-xs uppercase tracking-[0.3em] text-cyan-300/70">Dataset profile</p><h1 className="mt-3 text-4xl font-bold text-white">{dataset.data.name}</h1><p className="mt-4 max-w-3xl text-slate-300">{dataset.data.description || "No public description provided."}</p><div className="mt-8 grid gap-4 sm:grid-cols-3"><Info label="Classification" value={dataset.data.classification} /><Info label="Records" value={String(dataset.data.recordCount ?? "-")} /><Info label="Engine" value={dataset.data.selectedEngine ?? dataset.data.recommendedEngine ?? "Unassigned"} /></div><h2 className="mt-12 text-xl font-semibold text-white">Public reports</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{dataset.data.reports.map((report) => <ReportLink report={report} key={report.id} />)}</div>{dataset.data.reports.length === 0 && <p className="mt-4 text-sm text-slate-500">No public reports are attached.</p>}</>}</Panel>;
}

export function PublicReportsPage() {
  const reports = useQuery({ queryKey: ["public-reports"], queryFn: () => listPublicReports() });
  return <Panel className="mt-14"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">Public intelligence</p><h1 className="mt-3 text-4xl font-bold text-white">Reports</h1><p className="mt-4 text-slate-400">Published views over approved public datasets.</p>{reports.isPending && <p className="mt-10 text-slate-400">Loading reports...</p>}{reports.isError && <p className="mt-10 text-rose-200">The report catalog is temporarily unavailable.</p>}<div className="mt-10 grid gap-4 lg:grid-cols-2">{reports.data?.items.map((report) => <ReportLink report={report} key={report.id} />)}</div>{reports.data?.items.length === 0 && <p className="mt-10 text-slate-400">No public reports are available.</p>}</Panel>;
}

function ReportLink({ report }: { report: PublicReport }) {
  return <Link className="block rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-cyan-300/50" to={`/reports/${report.id}`}><h2 className="text-lg font-semibold text-white">{report.title}</h2><p className="mt-2 text-sm text-slate-400">{report.description || "No public description provided."}</p><p className="mt-4 text-xs text-slate-500">Published report</p></Link>;
}

export function PublicReportDetailPage() {
  const { id = "" } = useParams();
  const report = useQuery({ queryKey: ["public-report", id], queryFn: () => getPublicReport(id), enabled: Boolean(id) });
  return <Panel className="mt-14">{report.isPending && <p className="text-slate-400">Loading report...</p>}{report.isError && <p className="text-rose-200">This public report could not be found.</p>}{report.data && <><Link className="text-sm text-cyan-300" to="/reports">&lt;- Back to reports</Link><p className="mt-8 text-xs uppercase tracking-[0.3em] text-cyan-300/70">Published report</p><h1 className="mt-3 text-4xl font-bold text-white">{report.data.report.title}</h1><p className="mt-4 text-slate-300">{report.data.report.description || "No public description provided."}</p><Link className="mt-5 inline-block text-sm text-cyan-300 hover:text-white" to={`/datasets/${report.data.report.dataset.id}`}>View {report.data.report.dataset.name}</Link>{report.data.unavailable ? <p className="mt-10 rounded border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">This report is published, but its selected data engine is not available for live results.</p> : report.data.result && <ResultTable result={report.data.result} />}</>}</Panel>;
}

function ResultTable({ result }: { result: { columns: string[]; rows: Record<string, unknown>[] } }) {
  return <div className="mt-10 overflow-x-auto rounded border border-slate-800"><table className="min-w-full text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wider text-cyan-200"><tr>{result.columns.map((column) => <th className="px-4 py-3" key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 100).map((row, index) => <tr className="border-t border-slate-800 text-slate-300" key={index}>{result.columns.map((column) => <td className="px-4 py-3" key={column}>{String(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-l border-cyan-300/40 bg-slate-900/50 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-semibold text-white">{value}</p></div>;
}
