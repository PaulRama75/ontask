import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  ROLES,
  ROLE_LABELS,
  isAdminRole,
  getAccessMap,
  COLUMNS,
  type Role,
} from "@/lib/rbac";
import { saveRoleAccess } from "./actions";
import AccessMatrix from "./AccessMatrix";

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
          Super Admin has full edit and approve access on every column. This cannot be changed.
        </p>
      ) : (
        <AccessMatrix
          role={role}
          columns={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
          map={map}
          action={saveRoleAccess}
        />
      )}
    </main>
  );
}
