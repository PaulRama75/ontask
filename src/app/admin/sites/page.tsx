import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, ROLE_LABELS, type Role } from "@/lib/rbac";
import { saveUserSites } from "./actions";
import UserSiteEditor from "./UserSiteEditor";

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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">Site Access</h1>
      <p className="mt-1 text-sm text-slate-400">
        Restrict which job sites each person can see in the data grid. A user with no sites
        selected is unrestricted (sees all). Admins and Super Admins always see every site.
      </p>

      {allSites.length === 0 ? (
        <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          No sites exist yet. Sites are set per employee in the Data Grid (the &ldquo;Site&rdquo;
          column, filled by the Project Lead). Add sites there first, then assign them here.
        </p>
      ) : (
        <section className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Site access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/10 align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{u.name || u.email}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                    <span className="mt-1 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {ROLE_LABELS[u.role as Role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdminRole(u.role) ? (
                      <span className="text-xs text-slate-500">Full access (all sites)</span>
                    ) : (
                      <UserSiteEditor
                        userId={u.id}
                        allSites={allSites}
                        assigned={assignedByUser.get(u.id) ?? []}
                        action={saveUserSites}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
