"use client";

import { useActionState } from "react";
import { resetPassword } from "./actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />

      <label className="mt-6 block text-sm font-medium text-slate-300">New password</label>
      <input
        name="password"
        type="password"
        autoComplete="new-password"
        className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
      />

      <label className="mt-4 block text-sm font-medium text-slate-300">Confirm new password</label>
      <input
        name="confirm"
        type="password"
        autoComplete="new-password"
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
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
