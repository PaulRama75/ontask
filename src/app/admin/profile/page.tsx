import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import ProfileForms from "./ProfileForms";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { pinHash: true },
  });
  const hasPin = Boolean(user?.pinHash);
  const roleLabel = ROLE_LABELS[me.role as Role] ?? me.role;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">Profile</h1>
      <p className="mt-1 text-sm text-slate-400">Manage your account, password, and security PIN.</p>
      <ProfileForms email={me.email} role={roleLabel} name={me.name} hasPin={hasPin} />
    </main>
  );
}
