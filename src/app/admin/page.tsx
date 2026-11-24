import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref, isAdminRole, employeeRowScopeWhere } from "@/lib/rbac";
import { findDuplicateEmployeeIds } from "@/lib/duplicates";
import { createOnboardingLink, deleteEmployee } from "./actions";
import PinConfirmButton from "./PinConfirmButton";
import AssignContactCell from "./AssignContactCell";
import ImportEmployees from "./ImportEmployees";
import InvoicesPager from "./invoices/InvoicesPager";

export const dynamic = "force-dynamic";

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.onboarding) redirect(firstAllowedNavHref(nav));
  const isAdmin = isAdminRole(me.role);
  // Admin/Super Admin/HR can assign or change an employee's Project Lead/Manager.
  const canAssign = isAdmin || me.role === "HR";
  // Employees can't create onboarding links (enforced in the action too).
  const canCreateLink = me.role !== "EMPLOYEE";

  // Project Leads/Managers only see their own employees (assigned or created
  // by them), and Site Access limits non-admins to their sites -- same rows
  // as the data grid. Applied in the query so counts, duplicates and
  // onboarding links never include anyone else's employees.
  const rowScope = await employeeRowScopeWhere(me);

  const [employees, projectLeads, projectManagers] = await Promise.all([
    prisma.employee.findMany({
      where: rowScope,
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
    prisma.user.findMany({
      where: { role: "PROJECT_MANAGER", active: true },
      select: { email: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const duplicateIds = findDuplicateEmployeeIds(employees);

  // Search matches name, email, status, and the assigned Project Lead/Manager
  // (by email or display name).
  const contactName = new Map(
    [...projectLeads, ...projectManagers].map((u) => [u.email.toLowerCase(), u.name ?? ""]),
  );
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? employees.filter((e) => {
        const pl = e.projectLeadEmail ?? "";
        const pm = e.projectManagerEmail ?? "";
        const haystack = [
          e.firstName,
          e.lastName,
          `${e.firstName ?? ""} ${e.lastName ?? ""}`,
          e.email,
          e.status,
          pl,
          contactName.get(pl.toLowerCase()),
          pm,
          contactName.get(pm.toLowerCase()),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
    : employees;

  // Display-only counts for the stat chips.
  const countOf = (...statuses: string[]) => employees.filter((e) => statuses.includes(e.status)).length;

  const cardClass =
    "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
  const chip =
    "flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-[11px] uppercase tracking-wider text-slate-400";
  const field =
    "h-8 min-w-0 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40";
  const th = "whitespace-nowrap px-3 py-2.5 text-left";
  const td = "px-3 py-1.5 align-middle text-slate-300";

  return (
    // On desktop the page is exactly one screen tall (below the 69px top nav), so the
    // browser window never scrolls; only the table scrolls inside its card.
    <main className="mx-auto max-w-[1400px] px-4 py-3 lg:flex lg:h-[calc(100dvh-69px)] lg:flex-col lg:overflow-hidden lg:py-2">
      <section className={`lg:shrink-0 ${cardClass}`}>
        {/* Title, stat chips, actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="8" cy="6.5" r="3" /><path d="M2.5 17c0-3.2 2.5-5.5 5.5-5.5 1.4 0 2.6.4 3.6 1.2M15 11v6M12 14h6" strokeLinecap="round" /></svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Onboarding</h1>
              <p className="text-[11px] text-slate-400">Generate an onboarding link for a new employee, then track submissions.</p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
              Total <span className="text-base font-bold text-white">{employees.length}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Draft <span className="text-base font-bold text-white">{countOf("DRAFT")}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
              In review <span className="text-base font-bold text-white">{countOf("SUBMITTED", "HR_REVIEW", "RATES_ASSIGNED")}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
              Approved <span className="text-base font-bold text-white">{countOf("APPROVED")}</span>
            </span>
            {duplicateIds.size > 0 && (
              <span
                title={`${duplicateIds.size} employee${duplicateIds.size === 1 ? "" : "s"} share a name or email with another record. Check the "Duplicate" tag to spot possible re-onboards.`}
                className="flex h-8 cursor-help items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 text-[11px] uppercase tracking-wider text-amber-300"
              >
                Duplicates <span className="text-base font-bold text-amber-200">{duplicateIds.size}</span>
              </span>
            )}
          </div>
          <Link
            href="/admin/grid"
            className="flex h-8 items-center rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-400/15"
          >
            Open data grid →
          </Link>
        </div>

        {/* New onboarding link */}
        {canCreateLink && (
        <div className="border-t border-white/10 px-3 py-2.5">
          <form action={createOnboardingLink} className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
            <span className="flex h-8 shrink-0 items-center gap-1.5 pr-1 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" strokeLinecap="round" /></svg>
              New link
            </span>
            <input name="firstName" placeholder="First name" className={`${field} w-full sm:w-auto sm:flex-1`} />
            <input name="lastName" placeholder="Last name" className={`${field} w-full sm:w-auto sm:flex-1`} />
            <input name="email" type="email" required placeholder="Email (required)" className={`${field} w-full sm:w-auto sm:flex-[1.4]`} />
            <select
              name="projectLeadEmail"
              defaultValue=""
              title={projectLeads.length === 0 ? "No Project Lead users exist yet. Add one under Users to assign them here." : undefined}
              className={`${field} w-full sm:w-auto sm:flex-1`}
            >
              <option value="">{projectLeads.length === 0 ? "No Project Leads yet" : "Project Lead (optional)"}</option>
              {projectLeads.map((pl) => (
                <option key={pl.email} value={pl.email}>
                  {pl.name ? `${pl.name} (${pl.email})` : pl.email}
                </option>
              ))}
            </select>
            <select
              name="projectManagerEmail"
              defaultValue=""
              title={projectManagers.length === 0 ? "No Project Manager users exist yet. Add one under Users to assign them here." : undefined}
              className={`${field} w-full sm:w-auto sm:flex-1`}
            >
              <option value="">{projectManagers.length === 0 ? "No Project Managers yet" : "Project Manager (optional)"}</option>
              {projectManagers.map((pm) => (
                <option key={pm.email} value={pm.email}>
                  {pm.name ? `${pm.name} (${pm.email})` : pm.email}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="flex h-8 shrink-0 items-center rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-900/50 transition-colors hover:from-sky-400 hover:to-blue-500"
            >
              + Generate link
            </button>
          </form>
          {(projectLeads.length === 0 || projectManagers.length === 0) && (
            <p className="mt-1.5 text-[11px] text-amber-400">
              {projectLeads.length === 0 && "No Project Lead users exist yet. "}
              {projectManagers.length === 0 && "No Project Manager users exist yet. "}
              Add them under Users to assign them here.
            </p>
          )}
        </div>
        )}

        {canAssign && <ImportEmployees />}
      </section>

      <section className={`mt-3 overflow-hidden lg:mt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col ${cardClass}`}>
        <form method="get" className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <div className="relative min-w-[220px] max-w-xl flex-1">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, email, status, Project Lead or Manager…"
              aria-label="Search employees"
              className="h-9 w-full rounded-lg border border-white/10 bg-[#0a1426] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-400/15"
          >
            Search
          </button>
          {needle && (
            <Link
              href="/admin"
              className="flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:border-sky-400/40 hover:text-white"
            >
              Clear
            </Link>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {needle ? (
              <>
                <span className="font-semibold text-white">{shown.length}</span> of {employees.length} employees
              </>
            ) : (
              <>
                <span className="font-semibold text-white">{employees.length}</span> employees
              </>
            )}
          </span>
        </form>

        <InvoicesPager heightClass="max-h-[70vh] lg:max-h-none lg:min-h-[120px] lg:flex-1">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Status</th>
                <th className={th}>Project Lead</th>
                <th className={th}>Project Manager</th>
                <th className={`${th} text-center`}>Docs</th>
                <th className={`${th} text-center`}>Certs</th>
                <th className={th}>Onboarding link</th>
                {isAdmin && <th className={`${th} text-right`}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-4 py-10 text-center text-sm text-slate-500">
                    {employees.length === 0
                      ? "No employees yet. Generate a link above to get started."
                      : "No employees match your search."}
                  </td>
                </tr>
              )}
              {shown.map((e) => {
                const link = e.onboardingLink ? `${base}/onboard/${e.onboardingLink.token}` : null;
                const employeeName = [e.firstName, e.lastName].filter(Boolean).join(" ") || "employee";
                const linkLabel = `${employeeName}_onboarding`;
                return (
                  <tr
                    key={e.id}
                    data-row
                    className="border-b border-white/[0.06] transition-colors hover:bg-sky-400/[0.05]"
                  >
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/admin/employee/${e.id}`} className="font-semibold text-sky-300 hover:text-sky-200 hover:underline">
                        {[e.firstName, e.lastName].filter(Boolean).join(" ") || "(unnamed)"}
                      </Link>
                      {duplicateIds.has(e.id) && (
                        <span
                          title="Another employee shares this name or email — possible duplicate onboarding."
                          className="ml-1.5 inline-block rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                        >
                          Duplicate
                        </span>
                      )}
                    </td>
                    <td className={`${td} max-w-[240px] truncate`}>
                      {e.email ? (
                        <a href={`mailto:${e.email}`} title={e.email} className="text-slate-300 hover:text-sky-200 hover:underline">
                          {e.email}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <StatusBadge status={e.status} />
                    </td>
                    <td className={td}>
                      {canAssign ? (
                        <AssignContactCell employeeId={e.id} kind="PL" current={e.projectLeadEmail} options={projectLeads} />
                      ) : (
                        <ContactName email={e.projectLeadEmail} users={projectLeads} />
                      )}
                    </td>
                    <td className={td}>
                      {canAssign ? (
                        <AssignContactCell employeeId={e.id} kind="PM" current={e.projectManagerEmail} options={projectManagers} />
                      ) : (
                        <ContactName email={e.projectManagerEmail} users={projectManagers} />
                      )}
                    </td>
                    <td className={`${td} text-center tabular-nums`}>{e._count.documents}</td>
                    <td className={`${td} text-center tabular-nums`}>{e._count.certifications}</td>
                    <td className={`${td} max-w-[220px] truncate`}>
                      {link ? (
                        <a href={link} className="text-sky-300 hover:text-sky-200 hover:underline" target="_blank" title={link}>
                          {linkLabel}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className={`${td} text-right [&_form]:justify-end`}>
                        <PinConfirmButton
                          action={deleteEmployee}
                          fields={{ employeeId: e.id }}
                          confirmMessage={`Delete ${employeeName}? This removes their onboarding record, documents, and certifications. This can't be undone.`}
                          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                        >
                          Delete
                        </PinConfirmButton>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </InvoicesPager>
      </section>
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
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${colors[status] ?? "border border-white/10 bg-white/5 text-slate-300"}`}>
      {status}
    </span>
  );
}

function ContactName({ email, users }: { email: string | null; users: { email: string; name: string | null }[] }) {
  if (!email) return <span className="text-slate-500">Not assigned</span>;
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  return <span className="text-slate-300">{u?.name || email}</span>;
}
