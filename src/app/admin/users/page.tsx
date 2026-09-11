import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ROLES, ROLE_LABELS, isAdminRole, type Role } from "@/lib/rbac";
import {
  createUser,
  setUserRole,
  setUserActive,
  setInvoiceAdminRecipient,
  clearInvoiceAdminRecipient,
} from "./actions";
import NewUserForm from "./NewUserForm";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdminRole(me.role)) redirect("/admin/grid");

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const invoiceAdminRecipient = users.find((u) => u.receivesInvoiceAdminEmails) ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">Users</h1>
      <p className="mt-1 text-sm text-slate-400">
        Create staff accounts and assign roles. Roles drive column access.
      </p>

      <NewUserForm action={createUser} />

      <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-400 shadow-lg shadow-black/30 backdrop-blur">
        Invoice admin notifications (final-approval alerts, "Email Admins") go to{" "}
        {invoiceAdminRecipient ? (
          <span className="font-medium text-slate-200">
            {invoiceAdminRecipient.name || invoiceAdminRecipient.email}
          </span>
        ) : (
          <span className="font-medium text-slate-200">every active Admin/Super Admin</span>
        )}
        . Pick "Notify" on an Admin/Super Admin below to designate a single recipient instead.
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Invoice notifications</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/10 last:border-0">
                <td className="px-4 py-3 font-medium text-white">{u.name || "—"}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3">
                  <form action={setUserRole} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      key={u.role}
                      name="role"
                      defaultValue={u.role}
                      disabled={u.id === me.id}
                      className="rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r as Role]}
                        </option>
                      ))}
                    </select>
                    {u.id !== me.id && (
                      <button className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                        Save
                      </button>
                    )}
                  </form>
                </td>
                <td className="px-4 py-3">
                  {u.id === me.id ? (
                    <span className="text-xs text-slate-500">you</span>
                  ) : (
                    <form action={setUserActive}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="active" value={(!u.active).toString()} />
                      <button
                        className={
                          u.active
                            ? "rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                            : "rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600"
                        }
                      >
                        {u.active ? "Active" : "Disabled"}
                      </button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isAdminRole(u.role) ? (
                    u.receivesInvoiceAdminEmails ? (
                      <form action={clearInvoiceAdminRecipient} className="flex items-center gap-2">
                        <span className="rounded-md bg-cyan-500/15 px-2 py-1 text-xs font-semibold text-cyan-300">
                          Notifying
                        </span>
                        <button className="text-xs text-slate-400 hover:underline">Clear</button>
                      </form>
                    ) : (
                      <form action={setInvoiceAdminRecipient}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                          Notify
                        </button>
                      </form>
                    )
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
