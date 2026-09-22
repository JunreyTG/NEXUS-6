import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, getDataset, listAdmins, listDatasets, updateDataset, deleteDataset, uploadDataset, type DatasetRecord } from "./api";
import { useAuth } from "./auth";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "FILE_TOO_LARGE") return "The selected file is too large.";
  if (error instanceof ApiError && error.code === "FILE_TYPE_UNSUPPORTED") return "Only CSV, JSON, and XLSX files are supported.";
  if (error instanceof ApiError && error.status === 403) return "You do not have access to this dataset.";
  return "The dataset request could not be completed.";
}

function DatasetSummary({ dataset }: { dataset: DatasetRecord }) {
  return (
    <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
      <span><strong className="text-slate-500">Type</strong><br />{dataset.fileType}</span>
      <span><strong className="text-slate-500">Records</strong><br />{dataset.recordCount ?? "-"}</span>
      <span><strong className="text-slate-500">Status</strong><br />{dataset.status}</span>
      <span><strong className="text-slate-500">Visibility</strong><br />{dataset.visibility}</span>
    </div>
  );
}

export function DatasetListPage() {
  const { accessToken } = useAuth();
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: () => listDatasets(accessToken!), enabled: Boolean(accessToken) });
  return (
    <section className="mt-12 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Metadata workspace</p><h1 className="mt-2 text-3xl font-bold text-cyan-300">Datasets</h1></div><Link className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200" to="/datasets/upload">Upload Dataset</Link></div>
      {datasets.isError && <p className="mt-6 text-rose-200">Datasets are temporarily unavailable.</p>}
      {datasets.isPending && <p className="mt-8 text-slate-400">Loading datasets...</p>}
      {!datasets.isPending && datasets.data?.length === 0 && <p className="mt-8 text-slate-400">No datasets registered yet.</p>}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {datasets.data?.map((dataset) => <Link className="rounded border border-slate-800 bg-slate-900/60 p-5 transition hover:border-cyan-300/50" key={dataset.id} to={`/datasets/${dataset.id}`}><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold text-white">{dataset.name}</h2><span className="rounded-full border border-cyan-300/20 px-2 py-1 text-xs text-cyan-200">{dataset.visibility}</span></div><p className="mt-1 text-sm text-slate-500">{dataset.originalFilename}</p><div className="mt-5"><DatasetSummary dataset={dataset} /></div><p className="mt-4 text-xs text-slate-500">Created {new Date(dataset.createdAt).toLocaleString()}</p></Link>)}
      </div>
    </section>
  );
}

export function DatasetUploadPage() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<DatasetRecord["visibility"]>("PRIVATE");
  const [ownerAdminId, setOwnerAdminId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const admins = useQuery({ queryKey: ["admins"], queryFn: () => listAdmins(accessToken!), enabled: Boolean(accessToken && user?.role === "SUPER_ADMIN") });
  const mutation = useMutation({ mutationFn: () => uploadDataset({ file: file!, name, description, visibility, ...(user?.role === "SUPER_ADMIN" && ownerAdminId ? { ownerAdminId } : {}) }, accessToken!), onSuccess: async (dataset) => { await queryClient.invalidateQueries({ queryKey: ["datasets"] }); navigate(`/datasets/${dataset.id}`); }, onError: (uploadError) => setError(errorMessage(uploadError)) });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) { setError("Choose a CSV, JSON, or XLSX file."); return; }
    if (user?.role === "SUPER_ADMIN" && !ownerAdminId) { setError("Choose an Admin owner."); return; }
    void mutation.mutateAsync();
  }

  return <section className="mx-auto mt-12 max-w-2xl rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl"><Link className="text-sm text-cyan-300 hover:text-white" to="/datasets">&lt;- Back to Datasets</Link><h1 className="mt-6 text-3xl font-bold text-cyan-300">Upload Dataset</h1><p className="mt-3 text-sm text-slate-400">Contents are parsed temporarily; only dataset metadata is registered in Neon.</p><form className="mt-8 space-y-5" onSubmit={submit}><label className="block text-sm text-slate-300">Dataset name<input className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="block text-sm text-slate-300">Description<textarea className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setDescription(event.target.value)} rows={4} value={description} /></label><label className="block text-sm text-slate-300">File<input accept=".csv,.json,.xlsx" className="mt-2 block w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required type="file" /></label><label className="block text-sm text-slate-300">Visibility<select className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setVisibility(event.target.value as DatasetRecord["visibility"])} value={visibility}><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option></select></label>{user?.role === "SUPER_ADMIN" && <label className="block text-sm text-slate-300">Admin owner<select className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white" onChange={(event) => setOwnerAdminId(event.target.value)} required value={ownerAdminId}><option value="">Choose an owner</option>{admins.data?.map((admin) => <option key={admin.id} value={admin.id}>{admin.name} ({admin.email})</option>)}</select></label>}{error && <p className="rounded border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}<button className="w-full rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60" disabled={mutation.isPending} type="submit">{mutation.isPending ? "Uploading and parsing..." : "Upload Dataset"}</button></form></section>;
}

export function DatasetDetailPage() {
  const { id = "" } = useParams();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dataset = useQuery({ queryKey: ["dataset", id], queryFn: () => getDataset(id, accessToken!), enabled: Boolean(accessToken && id) });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<DatasetRecord["visibility"]>("PRIVATE");
  const update = useMutation({ mutationFn: () => updateDataset(id, { name, description, visibility }, accessToken!), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["dataset", id] }); setEditing(false); } });
  const remove = useMutation({ mutationFn: () => deleteDataset(id, accessToken!), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["datasets"] }); navigate("/datasets"); } });
  function beginEdit() { if (!dataset.data) return; setName(dataset.data.name); setDescription(dataset.data.description ?? ""); setVisibility(dataset.data.visibility); setEditing(true); }
  return <section className="mt-12 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl"><Link className="text-sm text-cyan-300 hover:text-white" to="/datasets">&lt;- Back to Datasets</Link>{dataset.isPending && <p className="mt-8 text-slate-400">Loading dataset...</p>}{dataset.isError && <p className="mt-8 text-rose-200">{errorMessage(dataset.error)}</p>}{dataset.data && <><div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Dataset metadata</p><h1 className="mt-2 text-3xl font-bold text-cyan-300">{dataset.data.name}</h1><p className="mt-1 text-sm text-slate-500">{dataset.data.originalFilename}</p></div><div className="flex gap-3"><button className="rounded border border-cyan-300/40 px-3 py-2 text-cyan-200 hover:text-white" onClick={beginEdit} type="button">Edit metadata</button><button className="rounded border border-rose-300/40 px-3 py-2 text-rose-200 hover:text-white" onClick={() => { if (window.confirm("Delete this dataset metadata?")) void remove.mutateAsync(); }} type="button">Delete</button></div></div><div className="mt-8"><DatasetSummary dataset={dataset.data} /></div><dl className="mt-8 grid gap-4 text-sm text-slate-300 sm:grid-cols-2"><div><dt className="text-slate-500">File size</dt><dd>{dataset.data.fileSizeBytes ?? "-"} bytes</dd></div><div><dt className="text-slate-500">Owner</dt><dd>{dataset.data.owner?.email ?? dataset.data.ownerAdminId}</dd></div><div><dt className="text-slate-500">Detected fields</dt><dd>{dataset.data.detectedFields.length ? dataset.data.detectedFields.join(", ") : "No fields detected"}</dd></div><div><dt className="text-slate-500">Created</dt><dd>{new Date(dataset.data.createdAt).toLocaleString()}</dd></div></dl>{editing && <form className="mt-8 space-y-4 rounded border border-slate-800 bg-slate-900/60 p-4" onSubmit={(event) => { event.preventDefault(); void update.mutateAsync(); }}><label className="block text-sm text-slate-300">Name<input className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="block text-sm text-slate-300">Description<textarea className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label><label className="block text-sm text-slate-300">Visibility<select className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" onChange={(event) => setVisibility(event.target.value as DatasetRecord["visibility"])} value={visibility}><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option></select></label><div className="flex gap-3"><button className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950" disabled={update.isPending} type="submit">Save</button><button className="rounded border border-slate-700 px-4 py-2 text-slate-300" onClick={() => setEditing(false)} type="button">Cancel</button></div></form>}</>}</section>;
}
