"use client";

import { useState, useTransition } from "react";
import type { SitesActionResult } from "./actions";

export default function UserSiteEditor({
  userId,
  allSites,
  assigned,
  action,
}: {
  userId: string;
  allSites: string[];
  assigned: string[];
  action: (form: FormData) => Promise<SitesActionResult>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assigned));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(site: string, on: boolean) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(site);
      else next.delete(site);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const form = new FormData();
    form.set("userId", userId);
    for (const s of selected) form.append("site", s);
    startTransition(async () => {
      const res = await action(form);
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Could not save.");
    });
  }

  const restricted = selected.size > 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {allSites.map((site) => {
          const on = selected.has(site);
          return (
            <label
              key={site}
              className={
                on
                  ? "flex cursor-pointer items-center gap-1 rounded-md border border-sky-400/50 bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-100 shadow-inner shadow-sky-500/10 transition-colors"
                  : "flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-[#0a1426] px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white"
              }
            >
              <input
                type="checkbox"
                checked={on}
                onChange={(ev) => toggle(site, ev.target.checked)}
                className="h-3 w-3 accent-sky-500"
              />
              {site}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex h-6 items-center rounded-md bg-gradient-to-b from-sky-500 to-blue-600 px-2.5 text-[11px] font-semibold text-white shadow shadow-blue-900/50 transition-colors hover:from-sky-400 hover:to-blue-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <span
          className={
            restricted
              ? "rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300"
              : "rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300"
          }
        >
          {restricted
            ? `Restricted to ${selected.size} site${selected.size === 1 ? "" : "s"}`
            : "Unrestricted (all sites)"}
        </span>
        {saved && <span className="text-[11px] text-emerald-400">Saved.</span>}
        {error && <span className="text-[11px] text-rose-400">{error}</span>}
      </div>
    </form>
  );
}
