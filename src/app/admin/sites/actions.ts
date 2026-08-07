"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

export type SitesActionResult = { ok: boolean; error?: string };

// Replace the full set of sites a user is restricted to.
// An empty set means the user is unrestricted (sees all sites).
export async function saveUserSites(form: FormData): Promise<SitesActionResult> {
  await requireAdmin();

  const userId = String(form.get("userId") ?? "");
  if (!userId) return { ok: false, error: "Missing user." };

  const sites = form
    .getAll("site")
    .map((s) => String(s).trim())
    .filter(Boolean);
  const unique = Array.from(new Set(sites));

  await prisma.$transaction([
    prisma.userSite.deleteMany({ where: { userId } }),
    ...unique.map((site) =>
      prisma.userSite.create({ data: { userId, site } }),
    ),
  ]);

  revalidatePath("/admin/sites");
  revalidatePath("/admin/grid");
  return { ok: true };
}
