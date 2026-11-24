"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export default function GridControls({
  total,
  shown,
  duplicateCount,
  showArchived,
  archivedCount,
}: {
  total: number;
  shown: number;
  duplicateCount: number;
  showArchived: boolean;
  archivedCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push the current controls into the URL (debounced for the text box),
  // preserving the archived toggle.
  function apply(nextQ: string, nextStatus: string) {
    const sp = new URLSearchParams(params.toString());
    if (nextQ.trim()) sp.set("q", nextQ.trim());
    else sp.delete("q");
    if (nextStatus !== "all") sp.set("status", nextStatus);
    else sp.delete("status");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `/admin/grid?${qs}` : "/admin/grid"));
  }

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply(q, status), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  function toggleArchived() {
    const sp = new URLSearchParams(params.toString());
    if (showArchived) sp.delete("archived");
    else sp.set("archived", "1");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `/admin/grid?${qs}` : "/admin/grid"));
  }

  function clear() {
    setQ("");
    setStatus("all");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <div className="relative min-w-[220px] flex-1">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 4 4" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone, SS#, address…"
          className="h-9 w-full rounded-lg border border-white/10 bg-[#0a1426] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 rounded-lg border border-white/10 bg-[#0a1426] px-3 text-sm text-white focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
      >
        <option value="all">All statuses</option>
        <option value="approved">Approved</option>
        <option value="pending">Pending</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="missing_docs">Missing documents</option>
        {duplicateCount > 0 && (
          <option value="duplicates">Possible duplicates ({duplicateCount})</option>
        )}
      </select>

      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[#0a1426] px-3 text-xs text-slate-300 hover:border-sky-400/40">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={toggleArchived}
          className="h-3.5 w-3.5 rounded border-white/10 bg-slate-800 accent-sky-500"
        />
        Show archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
      </label>

      {(q || status !== "all") && (
        <button
          onClick={clear}
          className="h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white"
        >
          Clear
        </button>
      )}

      <span className="ml-auto text-xs text-slate-400">
        <span className="font-semibold text-white">{shown}</span> of {total} employees
      </span>
    </div>
  );
}
