import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { createOnboardingLink } from "./actions";

export const dynamic = "force-dynamic";

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.onboarding) redirect(firstAllowedNavHref(nav));

  const [employees, projectLeads] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        onboardingLink: true,
        _count: { select: { documents: true, certifications: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "PROJECT_LEAD", active: true },
      select: { email: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <main className="min-h-screen bg-slate-950 py-10">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Admin · Onboarding</h1>
          <Link href="/admin/grid" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Open data grid →
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Generate an onboarding link for a new employee, then track submissions.
        </p>

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">New onboarding link</h2>
          <form action={createOnboardingLink} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
            <input name="firstName" placeholder="First name" className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400" />
            <input name="lastName" placeholder="Last name" className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400" />
            <input name="email" type="email" required placeholder="Email (required)" className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400" />
            <select
              name="projectLeadEmail"
              defaultValue=""
              className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400"
            >
              <option value="">Project Lead (optional)</option>
              {projectLeads.map((pl) => (
                <option key={pl.email} value={pl.email}>
                  {pl.name ? `${pl.name} (${pl.email})` : pl.email}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500">
              Generate link
            </button>
          </form>
          {projectLeads.length === 0 && (
            <p className="mt-2 text-xs text-amber-400">
              No Project Lead users exist yet. Add one under Users to assign them here.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Docs</th>
                <th className="px-4 py-3">Certs</th>
                <th className="px-4 py-3">Onboarding link</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No employees yet. Generate a link above to get started.
                  </td>
                </tr>
              )}
              {employees.map((e) => {
                const link = e.onboardingLink ? `${base}/onboard/${e.onboardingLink.token}` : null;
                return (
                  <tr key={e.id} className="border-b border-white/10 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/admin/employee/${e.id}`} className="text-cyan-400 hover:underline">
                        {[e.firstName, e.lastName].filter(Boolean).join(" ") || "(unnamed)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {e.email ? (
                        <a href={`mailto:${e.email}`} className="text-cyan-400 hover:underline">
                          {e.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">{e._count.documents}</td>
                    <td className="px-4 py-3 text-slate-400">{e._count.certifications}</td>
                    <td className="px-4 py-3">
                      {link ? (
                        <a href={link} className="break-all text-cyan-400 hover:underline" target="_blank">
                          {link}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "border border-white/10 bg-white/5 text-slate-300",
    SUBMITTED: "bg-blue-500/15 text-blue-300",
    HR_REVIEW: "bg-amber-500/15 text-amber-300",
    RATES_ASSIGNED: "bg-purple-500/15 text-purple-300",
    APPROVED: "bg-emerald-500/15 text-emerald-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "border border-white/10 bg-white/5 text-slate-300"}`}>
      {status}
    </span>
  );
}
