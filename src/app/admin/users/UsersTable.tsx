"use client";

import { useEffect, useRef, useState } from "react";

// Display-only wrapper: search + pagination over the table rows that the
// server page already rendered (rows carry a data-search attribute). It only
// shows/hides rows; it does not change any user data or actions.

const PAGE_SIZES = [10, 25, 50, 100];

export default function UsersTable({
  stats,
  children,
}: {
  stats: React.ReactNode;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [matchCount, setMatchCount] = useState(0);

  const pageCount = Math.max(1, Math.ceil(matchCount / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  // Runs after every render so rows added/removed by a server refresh are picked up.
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const q = query.trim().toLowerCase();
    const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("tbody tr[data-search]"));
    let i = 0;
    for (const tr of rows) {
      const match = !q || (tr.dataset.search ?? "").includes(q);
      tr.hidden = !match || i < start || i >= start + pageSize;
      if (match) i++;
    }
    if (i !== matchCount) setMatchCount(i);
  });

  const from = matchCount === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, matchCount);
  const first = Math.max(1, Math.min(current - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, k) => first + k);

  const navBtn =
    "flex h-7 min-w-7 items-center justify-center rounded-md border border-white/10 bg-slate-900/60 px-2 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10";

  return (
    <>
      <div className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search users by name, email or role…"
            className="h-9 w-full rounded-lg border border-white/10 bg-[#0a1426] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
          />
        </div>
        {stats}
      </div>

      <div ref={wrapRef} className="max-h-[calc(100vh-260px)] min-h-[200px] overflow-auto border-t border-white/10">
        {children}
        {matchCount === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {query ? `No users match “${query}”.` : "No users."}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0a1426]/60 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Showing <span className="font-semibold text-white">{from}–{to}</span> of{" "}
            <span className="font-semibold text-white">{matchCount}</span>
          </span>
          <label className="flex items-center gap-1.5">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-7 rounded-md border border-white/10 bg-slate-900/80 px-1.5 text-xs text-white focus:border-sky-400/60 focus:outline-none"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={navBtn} disabled={current === 1} onClick={() => setPage(1)} aria-label="First page">«</button>
          <button type="button" className={navBtn} disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page">‹</button>
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={
                p === current
                  ? "flex h-7 min-w-7 items-center justify-center rounded-md bg-gradient-to-b from-sky-500 to-blue-600 px-2 text-xs font-semibold text-white shadow shadow-blue-900/50"
                  : navBtn
              }
            >
              {p}
            </button>
          ))}
          <button type="button" className={navBtn} disabled={current === pageCount} onClick={() => setPage(current + 1)} aria-label="Next page">›</button>
          <button type="button" className={navBtn} disabled={current === pageCount} onClick={() => setPage(pageCount)} aria-label="Last page">»</button>
        </div>
      </div>
    </>
  );
}
