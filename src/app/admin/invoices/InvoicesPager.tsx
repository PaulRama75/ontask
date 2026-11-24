"use client";

import { useEffect, useRef, useState } from "react";

// Display-only pager for the invoices table (same look as the Users page).
// The server page already rendered every row that matches the search/filter;
// this only shows one page of them at a time. It changes no data or actions.

const PAGE_SIZES = [25, 50, 100];

export default function InvoicesPager({
  children,
  heightClass = "max-h-[calc(100vh-245px)]",
}: {
  children: React.ReactNode;
  // Optional: lets another page with a taller header keep the table on one screen.
  heightClass?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [rowCount, setRowCount] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  // Runs after every render so rows changed by a search/filter refresh are picked up.
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row]"));
    rows.forEach((tr, i) => {
      tr.hidden = i < start || i >= start + pageSize;
    });
    if (rows.length !== rowCount) setRowCount(rows.length);
  });

  const from = rowCount === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, rowCount);
  const first = Math.max(1, Math.min(current - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, k) => first + k);

  const navBtn =
    "flex h-7 min-w-7 items-center justify-center rounded-md border border-white/10 bg-slate-900/60 px-2 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10";

  return (
    <>
      <div ref={wrapRef} className={`${heightClass} min-h-[200px] overflow-auto border-t border-white/10`}>
        {children}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0a1426]/60 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Showing <span className="font-semibold text-white">{from}–{to}</span> of{" "}
            <span className="font-semibold text-white">{rowCount}</span>
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
