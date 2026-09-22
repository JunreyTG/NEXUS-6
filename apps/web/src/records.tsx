import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, createDatasetRecord, deleteDatasetRecord, listDatasetRecords, updateDatasetRecord, type DatabaseRecord } from "./api";
import { useAuth } from "./auth";

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function recordId(record: DatabaseRecord, index: number): string {
  const value = record.id ?? record._id;
  return typeof value === "string" || typeof value === "number" ? String(value) : String(index + 1);
}

function recordsError(error: unknown): string {
  if (error instanceof ApiError && (error.code === "DATABASE_NOT_CONFIGURED" || error.code === "DATASET_STORAGE_NOT_CONFIGURED")) return "Dataset storage is not configured yet.";
  if (error instanceof ApiError && error.status === 403) return "You do not have access to these records.";
  return "The record request could not be completed.";
}

function parseDraft(value: string): DatabaseRecord {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Record must be a JSON object.");
  return parsed as DatabaseRecord;
}

export function DatasetRecordsPage() {
  const { id = "" } = useParams();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("{\n  \"field\": \"value\"\n}");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const records = useQuery({
    queryKey: ["dataset-records", id, page],
    queryFn: () => listDatasetRecords(id, { page, pageSize: 25 }, accessToken!),
    enabled: Boolean(accessToken && id)
  });
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["dataset-records", id] }); };
  const create = useMutation({ mutationFn: () => createDatasetRecord(id, parseDraft(draft), accessToken!), onSuccess: invalidate, onError: (error) => setFormError(recordsError(error)) });
  const update = useMutation({ mutationFn: () => updateDatasetRecord(id, editingRecordId!, parseDraft(draft), accessToken!), onSuccess: async () => { setEditingRecordId(null); await invalidate(); }, onError: (error) => setFormError(recordsError(error)) });
  const remove = useMutation({ mutationFn: (record: string) => deleteDatasetRecord(id, record, accessToken!), onSuccess: invalidate, onError: (error) => setFormError(recordsError(error)) });

  function submit() {
    setFormError(null);
    try {
      if (editingRecordId) void update.mutateAsync();
      else void create.mutateAsync();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Record data is invalid.");
    }
  }

  const columns = [...new Set(records.data?.items.flatMap((record) => Object.keys(record)) ?? [])].slice(0, 12);
  return (
    <section className="mt-12 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl">
      <Link className="text-sm text-cyan-300 hover:text-white" to={`/datasets/${id}`}>&lt;- Back to Dataset</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Engine-neutral records</p><h1 className="mt-2 text-3xl font-bold text-cyan-300">Dataset Records</h1></div><span className="text-sm text-slate-500">Page {records.data?.page ?? page}</span></div>
      {records.isPending && <p className="mt-8 text-slate-400">Loading records...</p>}
      {records.isError && <p className="mt-8 rounded border border-rose-300/20 bg-rose-400/10 p-4 text-rose-200">{recordsError(records.error)}</p>}
      {records.data?.items.length === 0 && <p className="mt-8 text-slate-400">No records found.</p>}
      {records.data && records.data.items.length > 0 && <div className="mt-8 overflow-x-auto rounded border border-slate-800"><table className="min-w-full text-left text-sm text-slate-300"><thead className="bg-slate-900 text-slate-400"><tr>{columns.map((column) => <th className="px-4 py-3 font-medium" key={column}>{column}</th>)}<th className="px-4 py-3">Actions</th></tr></thead><tbody>{records.data.items.map((record, index) => { const idValue = recordId(record, index); return <tr className="border-t border-slate-800" key={idValue}><>{columns.map((column) => <td className="max-w-xs px-4 py-3 align-top" key={column}>{safeJson(record[column])}</td>)}</><td className="whitespace-nowrap px-4 py-3"><button className="mr-3 text-cyan-300 hover:text-white" onClick={() => { setEditingRecordId(idValue); setDraft(safeJson(record)); setFormError(null); }} type="button">Edit</button><button className="text-rose-300 hover:text-white" onClick={() => void remove.mutateAsync(idValue)} type="button">Delete</button></td></tr>; })}</tbody></table></div>}
      {records.data && <div className="mt-5 flex gap-3"><button className="rounded border border-slate-700 px-3 py-2 text-slate-300 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><button className="rounded border border-slate-700 px-3 py-2 text-slate-300 disabled:opacity-40" disabled={records.data.items.length < records.data.pageSize} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>}
      <div className="mt-8 rounded border border-slate-800 bg-slate-900/60 p-4"><h2 className="text-lg font-semibold text-white">{editingRecordId ? "Edit Record" : "Create Record"}</h2><textarea className="mt-4 min-h-40 w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white" onChange={(event) => setDraft(event.target.value)} value={draft} /><div className="mt-3 flex gap-3"><button className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50" disabled={create.isPending || update.isPending} onClick={submit} type="button">{editingRecordId ? "Update Record" : "Create Record"}</button>{editingRecordId && <button className="rounded border border-slate-700 px-4 py-2 text-slate-300" onClick={() => setEditingRecordId(null)} type="button">Cancel</button>}</div>{formError && <p className="mt-3 text-rose-200">{formError}</p>}</div>
    </section>
  );
}
