import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  isAdminRole,
  getRoleOptions,
  getAccessMap,
  getNavAccess,
  COLUMNS,
  NAV_ITEMS,
} from "@/lib/rbac";
import { saveRoleAccess, saveNavAccess } from "./actions";
import AccessMatrix from "./AccessMatrix";
import NavAccessMatrix from "./NavAccessMatrix";

export const dynamic = "force-dynamic";

const cardClass =
  "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
const chip =
  "flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-[11px] uppercase tracking-wider text-slate-400";
const chipNum = "text-base font-bold normal-case tabular-nums text-white";
const countBadge =
  "rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-[11px] text-sky-200";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdminRole(me.role)) redirect("/admin/grid");

  const { role: roleParam } = await searchParams;
  const roleOptions = await getRoleOptions();
  const role: string =
    roleParam && roleOptions.some((r) => r.key === roleParam) ? roleParam : "EMPLOYEE";

  const map = await getAccessMap(role);
  const navMap = await getNavAccess(role);

  // Header chip counts (display only).
  const roleLabel = roleOptions.find((r) => r.key === role)?.label ?? role;
  const visibleSections = NAV_ITEMS.filter((n) => (navMap as Record<string, boolean>)[n.key]).length;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-3 lg:flex lg:h-[calc(100dvh-69px)] lg:flex-col lg:overflow-hidden lg:py-2">
      {/* Header: title, stat chips, actions + role tabs */}
      <section className={`shrink-0 ${cardClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path
                  d="M10 2.5l6 2.5v4.5c0 3.8-2.6 6.9-6 8-3.4-1.1-6-4.2-6-8V5l6-2.5z M7.5 10l1.8 1.8L12.8 8.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Access Control</h1>
              <p className="text-[11px] text-slate-400">
                Choose what each role can see, edit, and approve per data column. Super Admin always has
                full access.
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
              Role <span className="text-sm font-bold normal-case text-white">{roleLabel}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow shadow-sky-400/60" />
              Roles <span className={chipNum}>{roleOptions.length}</span>
            </span>
            {role !== "SUPER_ADMIN" && (
              <span className={chip}>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
                Sections <span className={chipNum}>{visibleSections}/{NAV_ITEMS.length}</span>
              </span>
            )}
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
              Columns <span className={chipNum}>{COLUMNS.length}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5"
            >
              ← Admin home
            </Link>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-3 py-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Role</span>
          {roleOptions.map(({ key: r, label, status }) => {
            const isActive = r === role;
            return (
              <Link
                key={r}
                href={`/admin/access?role=${r}`}
                className={
                  isActive
                    ? "flex h-7 items-center rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-3 text-xs font-semibold text-white shadow-lg shadow-blue-900/50"
                    : "flex h-7 items-center rounded-lg border border-white/10 bg-[#0a1426] px-3 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:bg-sky-400/[0.06] hover:text-white"
                }
              >
                {label}
                {status !== "ACTIVE" && <span className="ml-1 text-[10px] opacity-60">(inactive)</span>}
              </Link>
            );
          })}
        </nav>
      </section>

      {role === "SUPER_ADMIN" ? (
        <p className={`mt-3 shrink-0 px-4 py-3 text-xs text-sky-200 ${cardClass}`}>
          Super Admin has full access to every column and every section. This cannot be changed.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:mt-2">
          {/* Navigation visibility */}
          <section className={`overflow-hidden lg:flex lg:min-h-0 lg:flex-col ${cardClass}`}>
            <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-white">Navigation</h2>
                <p className="text-[11px] text-slate-400">
                  Which top-level sections this role sees in the header — and can open at all.
                </p>
              </div>
              <span className={countBadge}>
                {NAV_ITEMS.length} sections
              </span>
            </div>
            <NavAccessMatrix
              key={`nav-${role}`}
              role={role}
              items={NAV_ITEMS.map((n) => ({ key: n.key, label: n.label }))}
              map={navMap}
              action={saveNavAccess}
            />
          </section>

          {/* Employee grid columns */}
          <section className={`overflow-hidden lg:flex lg:min-h-0 lg:flex-col ${cardClass}`}>
            <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-white">Employee grid columns</h2>
                <p className="text-[11px] text-slate-400">
                  Hidden, View or Edit per column. Approve is available only with Edit.
                </p>
              </div>
              <span className={countBadge}>
                {COLUMNS.length} columns
              </span>
            </div>
            <AccessMatrix
              key={`columns-${role}`}
              role={role}
              columns={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
              map={map}
              action={saveRoleAccess}
            />
          </section>
        </div>
      )}
    </main>
  );
}
