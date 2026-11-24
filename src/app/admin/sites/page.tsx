import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, ROLE_LABELS, type Role } from "@/lib/rbac";
import { saveUserSites } from "./actions";
import SitesTable from "./SitesTable";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdminRole(me.role)) redirect("/admin/grid");

  const [users, employeeSites, userSites] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.employee.findMany({
      where: { site: { not: null } },
      select: { site: true },
      distinct: ["site"],
    }),
    prisma.userSite.findMany(),
  ]);

  // The list of selectable sites = sites currently in use on employees,
  // unioned with any already-assigned sites (so removals stay visible).
  const allSites = Array.from(
    new Set([
      ...employeeSites.map((e) => e.site).filter((s): s is string => !!s),
      ...userSites.map((u) => u.site),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const assignedByUser = new Map<string, string[]>();
  for (const us of userSites) {
    const list = assignedByUser.get(us.userId) ?? [];
    list.push(us.site);
    assignedByUser.set(us.userId, list);
  }

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    roleLabel: ROLE_LABELS[u.role as Role] ?? u.role,
    isAdmin: isAdminRole(u.role),
    assigned: assignedByUser.get(u.id) ?? [],
  }));

  // Display-only counts for the stat chips.
  const fullCount = rows.filter((r) => r.isAdmin).length;
  const restrictedCount = rows.filter((r) => !r.isAdmin && r.assigned.length > 0).length;
  const openCount = rows.length - fullCount - restrictedCount;

  const cardClass =
    "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
  const chip =
    "flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-[11px] uppercase tracking-wider text-slate-400";

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-3">
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" strokeLinejoin="round" />
                <circle cx="10" cy="8" r="2.2" />
              </svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Site Access</h1>
              <p className="text-[11px] text-slate-400">
                Limit which job sites each person sees in the data grid. No sites selected = sees all.
                Admins and Super Admins always see every site.
              </p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-2 md:justify-end">
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
              Users <span className="text-base font-bold text-white">{rows.length}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow shadow-sky-400/60" />
              Sites <span className="text-base font-bold text-white">{allSites.length}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-violet-400 shadow shadow-violet-400/60" />
              Full access <span className="text-base font-bold text-white">{fullCount}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
              Restricted <span className="text-base font-bold text-white">{restrictedCount}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
              Unrestricted <span className="text-base font-bold text-white">{openCount}</span>
            </span>
          </div>
        </div>
      </section>

      {allSites.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          No sites exist yet. Sites are set per employee in the Data Grid (the &ldquo;Site&rdquo;
          column, filled by the Project Lead). Add sites there first, then assign them here.
        </p>
      ) : (
        <section className={`mt-3 overflow-hidden ${cardClass}`}>
          <SitesTable rows={rows} allSites={allSites} action={saveUserSites} />
        </section>
      )}
    </main>
  );
}
