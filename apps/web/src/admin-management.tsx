import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, createAdmin, listAdmins, resendVerification, updateAdmin, updateAdminStatus, type AdminRecord } from "./api";
import { useAuth } from "./auth";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "That email address is already in use.";
  if (error instanceof ApiError && error.code === "EMAIL_PROVIDER_UNAVAILABLE") return "Email delivery is unavailable. Check EMAIL_PROVIDER, RESEND_API_KEY, and EMAIL_FROM.";
  if (error instanceof ApiError && error.code === "SYSTEM_DATABASE_UNAVAILABLE") return "The system database is unavailable.";
  if (error instanceof ApiError && error.status === 503) return "The requested service is unavailable.";
  return "The request could not be completed.";
}

function statusClass(status: AdminRecord["status"]): string {
  return {
    PENDING: "border-amber-300/30 bg-amber-400/10 text-amber-200",
    ACTIVE: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
    DISABLED: "border-rose-300/30 bg-rose-400/10 text-rose-200"
  }[status];
}

export function AdminManagementPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [editingAdmin, setEditingAdmin] = useState<AdminRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: () => listAdmins(accessToken!),
    enabled: Boolean(accessToken)
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminRecord["status"] }) => updateAdminStatus(id, status, accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] })
  });
  const resendMutation = useMutation({
    mutationFn: (id: string) => resendVerification(id, accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] })
  });
  const editMutation = useMutation({
    mutationFn: () => updateAdmin(editingAdmin!.id, { name: editName, email: editEmail }, accessToken!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admins"] });
      setEditingAdmin(null);
    }
  });

  function beginEdit(admin: AdminRecord) {
    setEditingAdmin(admin);
    setEditName(admin.name);
    setEditEmail(admin.email);
  }

  return (
    <section className="mt-12 rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300/70">Super Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-cyan-300">Admin Management</h1>
        </div>
        <Link className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200" to="/admin-management/create">
          Create Admin
        </Link>
      </div>

      {(admins.error || statusMutation.error || resendMutation.error || editMutation.error) && (
        <p className="mt-6 rounded border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          {errorMessage(admins.error ?? statusMutation.error ?? resendMutation.error ?? editMutation.error)}
        </p>
      )}

      {editingAdmin && (
        <form className="mt-8 grid gap-4 rounded border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); void editMutation.mutateAsync(); }}>
          <label className="text-sm text-slate-300">
            Name
            <input className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2" onChange={(event) => setEditName(event.target.value)} required value={editName} />
          </label>
          <label className="text-sm text-slate-300">
            Email
            <input className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2" onChange={(event) => setEditEmail(event.target.value)} required type="email" value={editEmail} />
          </label>
          <button className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60" disabled={editMutation.isPending} type="submit">Save</button>
          <button className="rounded border border-slate-700 px-4 py-2 text-slate-300 hover:text-white" onClick={() => setEditingAdmin(null)} type="button">Cancel</button>
        </form>
      )}

      {admins.isPending ? (
        <p className="mt-8 text-slate-400">Loading administrators...</p>
      ) : admins.data?.length ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Verification</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.data.map((admin) => (
                <tr className="border-b border-slate-900 text-slate-300" key={admin.id}>
                  <td className="px-3 py-4 font-medium text-white">{admin.name}</td>
                  <td className="px-3 py-4">{admin.email}</td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(admin.status)}`}>{admin.status}</span>
                  </td>
                  <td className="px-3 py-4">{admin.emailVerified ? "Verified" : "Unverified"}</td>
                   <td className="space-x-3 px-3 py-4">
                     <button className="text-cyan-300 hover:text-white" onClick={() => beginEdit(admin)} type="button">Edit</button>
                     <button
                      className="text-cyan-300 hover:text-white disabled:opacity-50"
                      disabled={statusMutation.isPending}
                       onClick={() => void statusMutation.mutateAsync({ id: admin.id, status: admin.status === "DISABLED" ? (admin.emailVerified ? "ACTIVE" : "PENDING") : "DISABLED" })}
                      type="button"
                    >
                      {admin.status === "DISABLED" ? "Enable" : "Disable"}
                    </button>
                    {!admin.emailVerified && (
                      <button
                        className="text-cyan-300 hover:text-white disabled:opacity-50"
                        disabled={resendMutation.isPending}
                        onClick={() => void resendMutation.mutateAsync(admin.id)}
                        type="button"
                      >
                        Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 text-slate-400">No administrator accounts yet.</p>
      )}
    </section>
  );
}

export function CreateAdminPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => createAdmin({ name, email }, accessToken!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admins"] });
      navigate("/admin-management", { replace: true });
    },
    onError: (mutationError) => setError(errorMessage(mutationError))
  });

  return (
    <section className="mx-auto mt-12 max-w-xl rounded-lg border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl">
       <Link className="text-sm text-cyan-300 hover:text-white" to="/admin-management">&lt;- Back to Admin Management</Link>
      <h1 className="mt-6 text-3xl font-bold text-cyan-300">Create Admin</h1>
      <p className="mt-3 text-sm text-slate-400">The new administrator will receive an email verification link.</p>
      <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); void mutation.mutateAsync(); }}>
        <label className="block text-sm text-slate-300">
          Name
          <input className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2" onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="block text-sm text-slate-300">
          Email
          <input className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        {error && <p className="rounded border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <button className="w-full rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Creating..." : "Create Admin"}
        </button>
      </form>
    </section>
  );
}
