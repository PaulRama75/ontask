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
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">New user</h2>
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        <input name="name" placeholder="Name" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <select name="role" defaultValue="HR" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r as Role]}
            </option>
          ))}
        </select>
        <input name="password" type="text" placeholder="Temp password (8+ chars)" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Creating…" : "Create user"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {done && <p className="mt-2 text-sm text-green-600">User created.</p>}
    </section>
  );
}
