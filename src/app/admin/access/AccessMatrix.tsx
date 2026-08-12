"use client";

import { useState, useTransition } from "react";
import { LEVELS, type Level } from "@/lib/rbac";
import type { AccessActionResult } from "./actions";

type ColMeta = { key: string; label: string };
type Access = { level: Level; canApprove: boolean };

const LEVEL_LABELS: Record<Level, string> = {
  HIDDEN: "Hidden",
  VIEW: "View",
  EDIT: "Edit",
};

export default function AccessMatrix({
  role,
  columns,
  map,
  action,
}: {
  role: string;
  columns: ColMeta[];
  map: Record<string, Access>;
  action: (form: FormData) => Promise<AccessActionResult>;
}) {
  const [rows, setRows] = useState<Record<string, Access>>(() => {
    const init: Record<string, Access> = {};
    for (const c of columns) {
      init[c.key] = map[c.key] ?? { level: "VIEW", canApprove: false };
    }
    return init;
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setLevel(key: string, level: Level) {
    setSaved(false);
    setRows((prev) => ({
      ...prev,
      [key]: { level, canApprove: level === "EDIT" ? prev[key].canApprove : false },
    }));
  }

  function setApprove(key: string, canApprove: boolean) {
    setSaved(false);
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], canApprove } }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const form = new FormData();
    form.set("role", role);
    for (const c of columns) {
      form.set(`level_${c.key}`, rows[c.key].level);
      if (rows[c.key].level === "EDIT" && rows[c.key].canApprove) {
        form.set(`approve_${c.key}`, "on");
      }
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
            <th className="px-4 py-3">Column</th>
            <th className="px-4 py-3">Access</th>
            <th className="px-4 py-3">Can approve</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => {
            const row = rows[c.key];
            return (
              <tr key={c.key} className="border-b border-white/10 last:border-0">
                <td className="px-4 py-3 font-medium text-white">{c.label}</td>
                <td className="px-4 py-3">
                  <select
                    value={row.level}
                    onChange={(e) => setLevel(c.key, e.target.value as Level)}
                    className="rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={row.canApprove}
                    disabled={row.level !== "EDIT"}
                    onChange={(e) => setApprove(c.key, e.target.checked)}
                    className="h-4 w-4 rounded border-white/10 bg-slate-800 disabled:opacity-40"
                  />
                </td>
              </tr>
            );
          })}
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
