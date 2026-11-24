import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getRoleOptions } from "@/lib/rbac";
import {
  createUser,
  setUserRole,
  setUserActive,
  setInvoiceAdminRecipient,
  clearInvoiceAdminRecipient,
  setOnboardingHrRecipient,
  clearOnboardingHrRecipient,
  grantFullDocumentAccess,
  revokeFullDocumentAccess,
  deleteUser,
  createRole,
} from "./actions";
import NewUserForm from "./NewUserForm";
import UsersTable from "./UsersTable";
import PinConfirmButton from "../PinConfirmButton";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdminRole(me.role)) redirect("/admin/grid");

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const invoiceAdminRecipient = users.find((u) => u.receivesInvoiceAdminEmails) ?? null;
  const onboardingHrRecipient = users.find((u) => u.receivesOnboardingHrEmails) ?? null;
  const activeCount = users.filter((u) => u.active).length;
  const roleOptions = await getRoleOptions();
  const activeRoles = roleOptions.filter((r) => r.status === "ACTIVE");
  const roleLabel = (key: string) => roleOptions.find((r) => r.key === key)?.label ?? key;
  // Assignable roles, plus the user's current role if it's inactive/unknown.
  const roleChoicesFor = (current: string) =>
    activeRoles.some((r) => r.key === current)
      ? activeRoles
      : [...activeRoles, { key: current, label: roleLabel(current), status: "INACTIVE", builtIn: false }];
  const disabledCount = users.length - activeCount;

  const cardClass =
    "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
  const noteClass = "rounded-lg border border-white/[0.07] bg-[#0a1426]/70 px-3 py-2 text-[11px] leading-relaxed text-slate-400";
  const strong = "font-semibold text-sky-200";

  const head = (
    <thead className="sticky top-0 z-10 bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <tr>
          <th className="whitespace-nowrap px-3 py-2.5">Name</th>
          <th className="whitespace-nowrap px-3 py-2.5">Email</th>
          <th className="whitespace-nowrap px-3 py-2.5">Role</th>
          <th className="whitespace-nowrap px-3 py-2.5">Active</th>
          <th className="whitespace-nowrap px-3 py-2.5">Invoice notifications</th>
          <th className="whitespace-nowrap px-3 py-2.5">Onboarding notifications</th>
          <th className="whitespace-nowrap px-3 py-2.5">Document access</th>
        {isAdminRole(me.role) && <th className="whitespace-nowrap px-3 py-2.5 text-right">Action</th>}
      </tr>
    </thead>
  );

  const stats = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex h-9 items-center gap-2 rounded-lg border border-sky-400/50 bg-sky-500/10 px-3 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><circle cx="7.5" cy="7" r="3" /><path d="M2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 4.5a3 3 0 0 1 0 5.5M15 12c2 .5 3 2.3 3 5" strokeLinecap="round" /></svg>
        Total <span className="text-base font-bold text-white">{users.length}</span>
      </span>
      <span className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0a1426] px-3 text-[11px] uppercase tracking-wider text-slate-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
        Active <span className="text-base font-bold text-white">{activeCount}</span>
      </span>
      <span className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0a1426] px-3 text-[11px] uppercase tracking-wider text-slate-400">
        <span className="h-2 w-2 rounded-full bg-rose-400 shadow shadow-rose-400/60" />
        Disabled <span className="text-base font-bold text-white">{disabledCount}</span>
      </span>
    </div>
  );

  const rows = users.map((u) => (
      <tr
        key={u.id}
        data-search={`${u.name ?? ""} ${u.email} ${roleLabel(u.role)}`.toLowerCase()}
        className="border-b border-white/[0.06] transition-colors hover:bg-sky-400/[0.05]"
      >
        <td className="whitespace-nowrap px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-indigo-600/30 text-[11px] font-semibold uppercase text-sky-200 ring-1 ring-sky-400/30">
              {(u.name || u.email).slice(0, 1)}
            </span>
            <span className="font-semibold text-white">{u.name || "—"}</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{u.email}</td>
        <td className="px-3 py-1.5">
          {u.id === me.id ? (
            <select
              key={u.role}
              name="role"
              defaultValue={u.role}
              disabled
              className="rounded-md border border-white/10 bg-[#0a1426] px-2 py-0.5 text-xs text-white focus:border-cyan-400 focus:ring-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
            >
              {roleChoicesFor(u.role).map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : (
            <PinConfirmButton
              action={setUserRole}
              fields={{ userId: u.id }}
              inputs={
                <select
                  key={u.role}
                  name="role"
                  defaultValue={u.role}
                  className="rounded-md border border-white/10 bg-[#0a1426] px-2 py-0.5 text-xs text-white focus:border-cyan-400 focus:ring-cyan-400"
                >
                  {roleChoicesFor(u.role).map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              }
              confirmMessage={`Change the role for ${u.name || u.email}?`}
              className="rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-xs text-sky-200 transition-colors hover:bg-sky-400/15"
            >
              Save
            </PinConfirmButton>
          )}
        </td>
        <td className="px-3 py-1.5">
          {u.id === me.id ? (
            <span className="text-xs text-slate-500">you</span>
          ) : (
            <PinConfirmButton
              action={setUserActive}
              fields={{ userId: u.id, active: (!u.active).toString() }}
              confirmMessage={u.active ? `Disable ${u.name || u.email}?` : `Enable ${u.name || u.email}?`}
              className={
                u.active
                  ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                  : "rounded-md bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300 hover:bg-slate-600"
              }
            >
              {u.active ? "Active" : "Disabled"}
            </PinConfirmButton>
          )}
        </td>
        <td className="px-3 py-1.5">
          {isAdminRole(u.role) ? (
            u.receivesInvoiceAdminEmails ? (
              <form action={clearInvoiceAdminRecipient} className="flex items-center gap-2">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-300">
                  Notifying
                </span>
                <button className="text-xs text-slate-400 hover:underline">Clear</button>
              </form>
            ) : (
              <form action={setInvoiceAdminRecipient}>
                <input type="hidden" name="userId" value={u.id} />
                <button className="rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-xs text-sky-200 transition-colors hover:bg-sky-400/15">
                  Notify
                </button>
              </form>
            )
          ) : (
            <span className="text-xs text-slate-600">—</span>
          )}
        </td>
        <td className="px-3 py-1.5">
          {u.role === "HR" ? (
            u.receivesOnboardingHrEmails ? (
              <form action={clearOnboardingHrRecipient} className="flex items-center gap-2">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-300">
                  Notifying
                </span>
                <button className="text-xs text-slate-400 hover:underline">Clear</button>
              </form>
            ) : (
              <form action={setOnboardingHrRecipient}>
                <input type="hidden" name="userId" value={u.id} />
                <button className="rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-xs text-sky-200 transition-colors hover:bg-sky-400/15">
                  Notify
                </button>
              </form>
            )
          ) : (
            <span className="text-xs text-slate-600">—</span>
          )}
        </td>
        <td className="px-3 py-1.5">
          {u.hasFullDocumentAccess ? (
            <form action={revokeFullDocumentAccess} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={u.id} />
              <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-300">
                Granted
              </span>
              <button className="text-xs text-slate-400 hover:underline">Revoke</button>
            </form>
          ) : (
            <form action={grantFullDocumentAccess}>
              <input type="hidden" name="userId" value={u.id} />
              <button className="rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-xs text-sky-200 transition-colors hover:bg-sky-400/15">
                Grant
              </button>
            </form>
          )}
        </td>
        {isAdminRole(me.role) && (
          <td className="px-3 py-1.5 [&_form]:justify-end">
            {u.id !== me.id && (
              <PinConfirmButton
                action={deleteUser}
                fields={{ userId: u.id }}
                confirmMessage={`Delete ${u.name || u.email}? This can't be undone.`}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
              >
                Delete
              </PinConfirmButton>
            )}
          </td>
        )}
      </tr>
  ));

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-5">
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="10" cy="6.5" r="3" /><path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" strokeLinecap="round" /></svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Users</h1>
              <p className="text-[11px] text-slate-400">Create staff accounts and assign roles. Roles drive column access.</p>
            </div>
          </div>
          <NewUserForm
            action={createUser}
            createRoleAction={createRole}
            roles={activeRoles.map((r) => ({ key: r.key, label: r.label }))}
          />
        </div>

        <div className="grid gap-2 border-t border-white/10 px-3 py-2.5 md:grid-cols-3">
          <div className={noteClass}>
            Invoice admin notifications (final-approval alerts, "Email Admins") go to{" "}
            {invoiceAdminRecipient ? (
              <span className={strong}>{invoiceAdminRecipient.name || invoiceAdminRecipient.email}</span>
            ) : (
              <span className={strong}>every active Admin/Super Admin</span>
            )}
            . Pick "Notify" on an Admin/Super Admin below to designate a single recipient instead.
          </div>
          <div className={noteClass}>
            Onboarding submission emails go to{" "}
            {onboardingHrRecipient ? (
              <span className={strong}>{onboardingHrRecipient.name || onboardingHrRecipient.email}</span>
            ) : (
              <span className={strong}>every active HR user</span>
            )}
            {" "}(plus the Project Lead/Manager picked when the link was created). Pick "Notify" on an HR
            user below to designate a single recipient instead.
          </div>
          <div className={noteClass}>
            "Document access" gives a specific person full view/download access to every employee's
            documents, regardless of their role -- unlike the notification settings above, any number of
            people can have this on at once.
          </div>
        </div>
      </section>

      <section className={`mt-3 overflow-hidden ${cardClass}`}>
        <UsersTable stats={stats}>
          <table className="w-full min-w-[960px] text-left text-[13px]">
            {head}
            <tbody>{rows}</tbody>
          </table>
        </UsersTable>
      </section>
    </main>
  );
}
