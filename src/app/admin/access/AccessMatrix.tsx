"use client";

import { useState, useTransition } from "react";
import { LEVELS, type Level } from "@/lib/rbac";
import type { AccessActionResult } from "./actions";

type ColMeta = { key: string; label: string };
type Access = { level: Level; canApprove: boolean };

// Display-only colour per level so the matrix is easy to scan.
const LEVEL_STYLES: Record<Level, string> = {
  HIDDEN: "border-white/10 text-slate-400",
  VIEW: "border-sky-400/30 text-sky-200",
  EDIT: "border-emerald-400/35 text-emerald-300",
};

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
      className="border-t border-white/[0.06] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      <div className="max-h-[60vh] overflow-auto lg:max-h-none lg:min-h-0 lg:flex-1 [color-scheme:dark] [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.35)_#0a1426]">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
          <tr>
            <th className="whitespace-nowrap px-3 py-2">Column</th>
            <th className="whitespace-nowrap px-3 py-2">Access</th>
            <th className="whitespace-nowrap px-3 py-2">Can approve</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => {
            const row = rows[c.key];
            return (
              <tr key={c.key} className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-sky-400/[0.05]">
                <td className="px-3 py-1.5 font-medium text-white">{c.label}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={row.level}
                    onChange={(e) => setLevel(c.key, e.target.value as Level)}
                    className={`h-7 rounded-lg border bg-[#0a1426] px-2 text-xs font-medium focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40 [color-scheme:dark] ${LEVEL_STYLES[row.level]}`}
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={row.canApprove}
                    disabled={row.level !== "EDIT"}
                    onChange={(e) => setApprove(c.key, e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-white/10 bg-[#0a1426] accent-sky-500 disabled:cursor-not-allowed disabled:opacity-30"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.06] bg-[#0a1426]/60 px-3 py-2">
        <button
          type="submit"
          disabled={pending}
          className="flex h-8 items-center rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-900/50 transition-colors hover:from-sky-400 hover:to-blue-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-300">Saved.</span>}
        {error && <span className="text-xs font-medium text-rose-300">{error}</span>}
      </div>
    </form>
  );
}
