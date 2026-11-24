import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, destroySession } from "@/lib/auth";
import ProfileMenu from "./ProfileMenu";
import AdminNav from "./AdminNav";
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 lg:flex-nowrap">
          <Link href="/admin/grid" className="flex items-center">
            <Image src="/logoblack.png" alt="FER" width={40} height={26} className="h-7 w-auto" priority />
          </Link>
          <AdminNav
            items={[
              ...NAV_ITEMS.filter((item) => nav[item.key]).map(({ key, label, href }) => ({ key, label, href })),
              ...(admin
                ? [
                    { key: "users", label: "Users", href: "/admin/users" },
                    { key: "access", label: "Access Control", href: "/admin/access" },
                    { key: "sites", label: "Site Access", href: "/admin/sites" },
                  ]
                : []),
            ]}
          />
          <div className="ml-auto flex items-center">
            <ProfileMenu
              name={user.name || user.email}
              roleLabel={ROLE_LABELS[user.role as Role] ?? user.role}
              logout={logout}
            />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
