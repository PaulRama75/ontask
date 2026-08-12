"use client";

import { useActionState } from "react";
import { createInvoice, type CreateInvoiceResult } from "../actions";

export default function NewInvoiceForm() {
  const [state, formAction, pending] = useActionState<CreateInvoiceResult, FormData>(
    createInvoice,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="mt-6 space-y-4 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur"
    >
      <div>
        <label className="block text-sm font-medium text-slate-300">Site</label>
        <input
          name="site"
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300">Client name</label>
        <input
          name="clientName"
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300">Client email</label>
        <input
          name="clientEmail"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
        />
      </div>
      {state?.ok === false && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-300">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
