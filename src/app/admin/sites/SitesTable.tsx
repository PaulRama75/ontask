"use client";

import { useMemo, useState } from "react";
import type { SitesActionResult } from "./actions";
import UserSiteEditor from "./UserSiteEditor";

// Display-only search, role filter and paging for the Site Access table.
// Every row stays mounted (non-matching rows are just hidden), so unsaved
// checkbox picks are never lost while searching or changing page.

type Row = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  isAdmin: boolean;
  assigned: string[];
};

const PAGE_SIZES = [25, 50, 100];

export default function SitesTable({
  rows,
  allSites,
  action,
}: {
  rows: Row[];
  allSites: string[];
  action: (form: FormData) => Promise<SitesActionResult>;
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const roles = useMemo(() => Array.from(new Set(rows.map((r) => r.roleLabel))).sort(), [rows]);

  const needle = q.trim().toLowerCase();
  const matching = rows.filter((r) => {
    if (role !== "all" && r.roleLabel !== role) return false;
    if (needle && !`${r.name} ${r.email} ${r.roleLabel}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const visibleIds = new Set(matching.slice(start, start + pageSize).map((r) => r.id));

  const from = matching.length === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, matching.length);
  const first = Math.max(1, Math.min(current - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, k) => first + k);

  const field =
    "h-9 rounded-lg border border-white/10 bg-[#0a1426] px-3 text-sm text-white focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40";
  const navBtn =
    "flex h-7 min-w-7 items-center justify-center rounded-md border border-white/10 bg-slate-900/60 px-2 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10";
  const th = "whitespace-nowrap px-3 py-2.5 text-left";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="relative min-w-[200px] flex-1">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            className={`w-full pl-9 placeholder:text-slate-500 ${field}`}
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className={field}
        >
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {(q || role !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setRole("all");
              setPage(1);
            }}
            className="h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          <span className="font-semibold text-white">{matching.length}</span> of {rows.length} users
        </span>
      </div>

      <div className="max-h-[calc(100vh-235px)] min-h-[200px] overflow-auto border-t border-white/10">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 hidden bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)] md:table-header-group">
            <tr>
              <th className={`${th} w-[30%]`}>User</th>
              <th className={`${th} w-36`}>Role</th>
              <th className={th}>Site access</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {matching.length === 0 && (
              <tr className="block md:table-row">
                <td className="block px-4 py-10 text-center text-sm text-slate-500 md:table-cell" colSpan={3}>
                  No users match your search/filter.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr
                key={u.id}
                className={
                  visibleIds.has(u.id)
                    ? "block border-b border-white/[0.06] px-3 py-2 transition-colors hover:bg-sky-400/[0.04] md:table-row md:px-0 md:py-0"
                    : "hidden"
                }
              >
                <td className="block align-top md:table-cell md:px-3 md:py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-blue-700/40 text-[11px] font-bold uppercase text-sky-100 ring-1 ring-sky-400/30">
                      {initials(u.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-white [overflow-wrap:anywhere]">{u.name}</div>
                      <div className="text-[11px] text-slate-400 [overflow-wrap:anywhere]">{u.email}</div>
                    </div>
                    <span className={`ml-auto shrink-0 md:hidden ${roleBadge(u.isAdmin)}`}>{u.roleLabel}</span>
                  </div>
                </td>
                <td className="hidden align-top md:table-cell md:px-3 md:py-2">
                  <span className={roleBadge(u.isAdmin)}>{u.roleLabel}</span>
                </td>
                <td className="mt-2 block align-top md:mt-0 md:table-cell md:px-3 md:py-2">
                  {u.isAdmin ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[11px] font-medium text-violet-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                      Full access (all sites)
                    </span>
                  ) : (
                    <UserSiteEditor userId={u.id} allSites={allSites} assigned={u.assigned} action={action} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0a1426]/60 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Showing <span className="font-semibold text-white">{from}–{to}</span> of{" "}
            <span className="font-semibold text-white">{matching.length}</span>
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

function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function roleBadge(isAdmin: boolean): string {
  return isAdmin
    ? "inline-block whitespace-nowrap rounded-md border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[11px] font-semibold text-sky-200"
    : "inline-block whitespace-nowrap rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300";
}
