import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, destroySession } from "@/lib/auth";
import { isAdminRole, getNavAccess, NAV_ITEMS, ROLE_LABELS, type Role } from "@/lib/rbac";

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
  const nav = await getNavAccess(user.role);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3">
          <Link href="/admin/grid" className="text-sm font-bold tracking-wide text-cyan-400">
            FER
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_ITEMS.filter((item) => nav[item.key]).map((item) => (
              <Link key={item.key} href={item.href} className="text-slate-400 hover:text-white">
                {item.label}
              </Link>
            ))}
            {admin && (
              <>
                <Link href="/admin/users" className="text-slate-400 hover:text-white">
                  Users
                </Link>
                <Link href="/admin/access" className="text-slate-400 hover:text-white">
                  Access Control
                </Link>
                <Link href="/admin/sites" className="text-slate-400 hover:text-white">
                  Site Access
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-400">
              {user.name || user.email}
              <span className="ml-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-300">
                {ROLE_LABELS[user.role as Role] ?? user.role}
              </span>
            </span>
            <form action={logout}>
              <button className="rounded-md border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5">
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
