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
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {allSites.map((site) => {
          const on = selected.has(site);
          return (
            <label
              key={site}
              className={
                on
                  ? "cursor-pointer rounded-md border border-blue-500/40 bg-blue-500/15 px-2 py-1 text-xs font-medium text-blue-300"
                  : "cursor-pointer rounded-md border border-white/10 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
              }
            >
              <input
                type="checkbox"
                checked={on}
                onChange={(ev) => toggle(site, ev.target.checked)}
                className="mr-1 align-middle"
              />
              {site}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-slate-400">
          {restricted
            ? `Restricted to ${selected.size} site${selected.size === 1 ? "" : "s"}`
            : "Unrestricted (all sites)"}
        </span>
        {saved && <span className="text-xs text-emerald-400">Saved.</span>}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </form>
  );
}
