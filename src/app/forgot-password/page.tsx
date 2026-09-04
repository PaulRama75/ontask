"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/40 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-400">FER</p>
        <h1 className="mt-1 text-xl font-bold text-white">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter your account email and we&apos;ll send you a link to set a new password.
        </p>

        {state?.ok ? (
          <p className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form action={formAction}>
            <label className="mt-6 block text-sm font-medium text-slate-300">Email</label>
            <input
              name="email"
              type="email"
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
            />

            {state?.ok === false && (
              <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-300">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <Link href="/login" className="mt-4 block text-center text-sm text-slate-400 hover:text-white">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
