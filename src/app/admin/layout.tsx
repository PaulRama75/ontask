import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, destroySession } from "@/lib/auth";
import { isAdminRole, ROLE_LABELS, type Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = isAdminRole(user.role);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3">
          <Link href="/admin/grid" className="text-sm font-bold text-gray-900">
            FER
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/grid" className="text-gray-600 hover:text-gray-900">
              Data Grid
            </Link>
            <Link href="/admin" className="text-gray-600 hover:text-gray-900">
              Onboarding
            </Link>
            {["PROJECT_MANAGER", "ACCOUNT_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role) && (
              <Link href="/admin/invoices" className="text-gray-600 hover:text-gray-900">
                Invoices
              </Link>
            )}
            {admin && (
              <>
                <Link href="/admin/users" className="text-gray-600 hover:text-gray-900">
                  Users
                </Link>
                <Link href="/admin/access" className="text-gray-600 hover:text-gray-900">
                  Access Control
                </Link>
                <Link href="/admin/sites" className="text-gray-600 hover:text-gray-900">
                  Site Access
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-gray-500">
              {user.name || user.email}
              <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {ROLE_LABELS[user.role as Role] ?? user.role}
              </span>
            </span>
            <form action={logout}>
              <button className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
