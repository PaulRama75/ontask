"use client";

import { useState, useTransition } from "react";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/rbac";
import type { UserActionResult } from "./actions";

export default function NewUserForm({
  action,
}: {
  action: (form: FormData) => Promise<UserActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const form = new FormData(e.currentTarget);
    const el = e.currentTarget;
    startTransition(async () => {
      const res = await action(form);
      if (res.ok) {
        setDone(true);
        el.reset();
      } else {
        setError(res.error ?? "Could not create user.");
      }
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
      <h2 className="text-lg font-semibold text-white">New user</h2>
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        <input name="name" placeholder="Name" className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400" />
        <input name="email" type="email" placeholder="Email" required className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400" />
        <select name="role" defaultValue="HR" className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r as Role]}
            </option>
          ))}
        </select>
        <input name="password" type="text" placeholder="Temp password (8+ chars)" required className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400" />
        <button type="submit" disabled={pending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60">
          {pending ? "Creating…" : "Create user"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      {done && <p className="mt-2 text-sm text-emerald-400">User created.</p>}
    </section>
  );
}
