import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { ApiError, setPassword, verifyEmail } from "./api";

function tokenFromParams(params: URLSearchParams): string | null {
  const token = params.get("token");
  return token && token.trim() ? token : null;
}

function tokenError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return "This verification link is invalid, expired, or already used.";
  return "Verification is temporarily unavailable.";
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = tokenFromParams(params);
  const verification = useQuery({
    queryKey: ["verify-email", token],
    queryFn: () => verifyEmail(token!),
    enabled: Boolean(token),
    retry: false
  });

  return (
    <section className="mx-auto mt-16 max-w-xl rounded-lg border border-cyan-400/20 bg-slate-950/70 p-8 text-center shadow-2xl">
      <h1 className="text-3xl font-bold text-cyan-300">Email Verification</h1>
      {!token && <p className="mt-6 text-rose-200">Missing verification token.</p>}
      {token && verification.isPending && <p className="mt-6 text-slate-400">Verifying your email...</p>}
      {verification.isError && <p className="mt-6 text-rose-200">{tokenError(verification.error)}</p>}
      {verification.data && (
        <div className="mt-6">
          <p className="text-emerald-200">Your email has been verified successfully.</p>
          <p className="mt-2 text-sm text-slate-400">Set a password to activate your administrator account.</p>
          <Link className="mt-6 inline-block rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200" to={`/set-password?token=${encodeURIComponent(verification.data.setupToken)}`}>
            Set Password
          </Link>
        </div>
      )}
    </section>
  );
}

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = tokenFromParams(params);
  const [password, setPasswordValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => setPassword(token!, password, confirmation),
    onError: (mutationError) => setError(tokenError(mutationError))
  });

  if (mutation.isSuccess) {
    return (
      <section className="mx-auto mt-16 max-w-xl rounded-lg border border-emerald-300/20 bg-slate-950/70 p-8 text-center shadow-2xl">
        <h1 className="text-3xl font-bold text-emerald-200">Password Set</h1>
        <p className="mt-4 text-slate-300">Your administrator account is active.</p>
        <Link className="mt-6 inline-block rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200" to="/login">Continue to Login</Link>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-16 max-w-md rounded-lg border border-cyan-400/20 bg-slate-950/70 p-8 shadow-2xl">
      <h1 className="text-3xl font-bold text-cyan-300">Set Password</h1>
      <p className="mt-3 text-sm text-slate-400">Choose a password of at least 12 characters.</p>
      {!token && <p className="mt-6 text-rose-200">Missing setup token.</p>}
      {token && (
        <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); setError(null); void mutation.mutateAsync(); }}>
          <label className="block text-sm text-slate-300">
            New password
            <input className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2" minLength={12} onChange={(event) => setPasswordValue(event.target.value)} required type="password" value={password} />
          </label>
          <label className="block text-sm text-slate-300">
            Confirm password
            <input className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-cyan-300 focus:ring-2" minLength={12} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
          </label>
          {password && confirmation && password !== confirmation && <p className="text-sm text-rose-200">Passwords do not match.</p>}
          {error && <p className="rounded border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <button className="w-full rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={mutation.isPending || password !== confirmation} type="submit">
            {mutation.isPending ? "Saving..." : "Set Password"}
          </button>
        </form>
      )}
    </section>
  );
}
