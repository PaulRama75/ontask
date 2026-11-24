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
      className="border-t border-white/[0.06] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      <div className="max-h-[60vh] overflow-auto lg:max-h-none lg:min-h-0 lg:flex-1 [color-scheme:dark] [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.35)_#0a1426]">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
          <tr>
            <th className="whitespace-nowrap px-3 py-2">Section</th>
            <th className="whitespace-nowrap px-3 py-2">Visible</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-sky-400/[0.05]">
              <td className="px-3 py-1.5 font-medium text-white">{item.label}</td>
              <td className="px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={rows[item.key]}
                  onChange={(e) => toggle(item.key, e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-white/10 bg-[#0a1426] accent-sky-500"
                />
              </td>
            </tr>
          ))}
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
