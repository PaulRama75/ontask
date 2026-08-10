import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  ROLES,
  ROLE_LABELS,
  isAdminRole,
  getAccessMap,
  getNavAccess,
  COLUMNS,
  NAV_ITEMS,
  type Role,
} from "@/lib/rbac";
import { saveRoleAccess, saveNavAccess } from "./actions";
import AccessMatrix from "./AccessMatrix";
import NavAccessMatrix from "./NavAccessMatrix";

export const dynamic = "force-dynamic";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdminRole(me.role)) redirect("/admin/grid");

  const { role: roleParam } = await searchParams;
  const role: Role =
    roleParam && ROLES.includes(roleParam as Role) ? (roleParam as Role) : "EMPLOYEE";

  const map = await getAccessMap(role);
  const navMap = await getNavAccess(role);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Access Control</h1>
      <p className="mt-1 text-sm text-gray-500">
        Choose what each role can see, edit, and approve per data column. Super Admin always has
        full access.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const isActive = r === role;
          return (
            <Link
              key={r}
              href={`/admin/access?role=${r}`}
              className={
                isActive
                  ? "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              }
            >
              {ROLE_LABELS[r]}
            </Link>
          );
        })}
      </nav>

      {role === "SUPER_ADMIN" ? (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Super Admin has full access to every column and every section. This cannot be changed.
        </p>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold text-gray-900">Navigation</h2>
          <p className="mt-1 text-sm text-gray-500">
            Which top-level sections this role sees in the header — and can open at all.
          </p>
          <NavAccessMatrix
            role={role}
            items={NAV_ITEMS.map((n) => ({ key: n.key, label: n.label }))}
            map={navMap}
            action={saveNavAccess}
          />

          <h2 className="mt-8 text-lg font-semibold text-gray-900">Employee grid columns</h2>
          <AccessMatrix
            role={role}
            columns={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
            map={map}
            action={saveRoleAccess}
          />
        </>
      )}
    </main>
  );
}
