"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type StatusOption = { value: string; label: string };

export default function InvoiceControls({
  total,
  shown,
  showArchived,
  archivedCount,
  statusOptions,
}: {
  total: number;
  shown: number;
  showArchived: boolean;
  archivedCount: number;
  statusOptions: StatusOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push the current controls into the URL (debounced for the text box),
  // preserving any existing sort params.
  function apply(nextQ: string, nextStatus: string) {
    const sp = new URLSearchParams(params.toString());
    if (nextQ.trim()) sp.set("q", nextQ.trim());
    else sp.delete("q");
    if (nextStatus !== "all") sp.set("status", nextStatus);
    else sp.delete("status");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `/admin/invoices?${qs}` : "/admin/invoices"));
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
    startTransition(() => router.replace(qs ? `/admin/invoices?${qs}` : "/admin/invoices"));
  }

  function clear() {
    setQ("");
    setStatus("all");
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search site or client…"
        className="w-64 rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 shadow-sm focus:border-cyan-400 focus:ring-cyan-400"
      />

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white shadow-sm focus:border-cyan-400"
      >
        <option value="all">All statuses</option>
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={toggleArchived}
          className="h-4 w-4 rounded border-white/10 bg-slate-800"
        />
        Show archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
      </label>

      {(q || status !== "all") && (
        <button
          onClick={clear}
          className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          Clear
        </button>
      )}

      <span className="ml-auto text-sm text-slate-400">
        {shown} of {total} invoices
      </span>
    </div>
  );
}
