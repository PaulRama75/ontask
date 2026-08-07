import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createOnboardingLink } from "./actions";

export const dynamic = "force-dynamic";

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

export default async function AdminPage() {
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
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Admin · Onboarding</h1>
          <Link href="/admin/grid" className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700">
            Open data grid →
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Generate an onboarding link for a new employee, then track submissions.
        </p>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">New onboarding link</h2>
          <form action={createOnboardingLink} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
            <input name="firstName" placeholder="First name" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input name="lastName" placeholder="Last name" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input name="email" type="email" required placeholder="Email (required)" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <select
              name="projectLeadEmail"
              defaultValue=""
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
            >
              <option value="">Project Lead (optional)</option>
              {projectLeads.map((pl) => (
                <option key={pl.email} value={pl.email}>
                  {pl.name ? `${pl.name} (${pl.email})` : pl.email}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Generate link
            </button>
          </form>
          {projectLeads.length === 0 && (
            <p className="mt-2 text-xs text-amber-600">
              No Project Lead users exist yet. Add one under Users to assign them here.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
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
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No employees yet. Generate a link above to get started.
                  </td>
                </tr>
              )}
              {employees.map((e) => {
                const link = e.onboardingLink ? `${base}/onboard/${e.onboardingLink.token}` : null;
                return (
                  <tr key={e.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/admin/employee/${e.id}`} className="text-blue-600 hover:underline">
                        {[e.firstName, e.lastName].filter(Boolean).join(" ") || "(unnamed)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e._count.documents}</td>
                    <td className="px-4 py-3 text-gray-600">{e._count.certifications}</td>
                    <td className="px-4 py-3">
                      {link ? (
                        <a href={link} className="break-all text-blue-600 hover:underline" target="_blank">
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
    DRAFT: "bg-gray-100 text-gray-700",
    SUBMITTED: "bg-blue-100 text-blue-700",
    HR_REVIEW: "bg-amber-100 text-amber-700",
    RATES_ASSIGNED: "bg-purple-100 text-purple-700",
    APPROVED: "bg-green-100 text-green-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}
