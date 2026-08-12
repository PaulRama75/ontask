"use client";

import { useState, useTransition } from "react";
import type { AccessActionResult } from "./actions";

type NavMeta = { key: string; label: string };

export default function NavAccessMatrix({
  role,
  items,
  map,
  action,
}: {
  role: string;
  items: NavMeta[];
  map: Record<string, boolean>;
  action: (form: FormData) => Promise<AccessActionResult>;
}) {
  const [rows, setRows] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of items) init[item.key] = map[item.key] ?? false;
    return init;
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string, visible: boolean) {
    setSaved(false);
    setRows((prev) => ({ ...prev, [key]: visible }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const form = new FormData();
    form.set("role", role);
    for (const item of items) {
      if (rows[item.key]) form.set(`visible_${item.key}`, "on");
    }
    startTransition(async () => {
      const res = await action(form);
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur"
    >
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Section</th>
            <th className="px-4 py-3">Visible</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="border-b border-white/10 last:border-0">
              <td className="px-4 py-3 font-medium text-white">{item.label}</td>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={rows[item.key]}
                  onChange={(e) => toggle(item.key, e.target.checked)}
                  className="h-4 w-4 rounded border-white/10 bg-slate-800"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved.</span>}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>
    </form>
  );
}
