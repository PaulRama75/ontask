"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, ROLES, COLUMN_KEYS, LEVELS, NAV_ITEMS, type Level } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

export type AccessActionResult = { ok: boolean; error?: string };

// Save the full column-access matrix for a single role.
// Expects form fields level_<key> and approve_<key> for each column.
export async function saveRoleAccess(form: FormData): Promise<AccessActionResult> {
  await requireAdmin();

  const role = String(form.get("role") ?? "");
  if (!ROLES.includes(role as (typeof ROLES)[number]))
    return { ok: false, error: "Invalid role." };
  if (role === "SUPER_ADMIN")
    return { ok: false, error: "Super Admin always has full access and cannot be changed." };

  for (const key of COLUMN_KEYS) {
    const level = String(form.get(`level_${key}`) ?? "VIEW");
    if (!LEVELS.includes(level as Level)) continue;
    const canApprove = level === "EDIT" && form.get(`approve_${key}`) === "on";
    await prisma.columnAccess.upsert({
      where: { role_columnKey: { role, columnKey: key } },
      update: { level, canApprove },
      create: { role, columnKey: key, level, canApprove },
    });
  }

  revalidatePath("/admin/access");
  revalidatePath("/admin/grid");
  return { ok: true };
}

// Save the full nav-visibility map for a single role.
// Expects a "visible_<navKey>" checkbox field for each nav item; unchecked = hidden.
export async function saveNavAccess(form: FormData): Promise<AccessActionResult> {
  await requireAdmin();

  const role = String(form.get("role") ?? "");
  if (!ROLES.includes(role as (typeof ROLES)[number]))
    return { ok: false, error: "Invalid role." };
  if (role === "SUPER_ADMIN")
    return { ok: false, error: "Super Admin always has full access and cannot be changed." };

  for (const item of NAV_ITEMS) {
    const visible = form.get(`visible_${item.key}`) === "on";
    await prisma.navAccess.upsert({
      where: { role_navKey: { role, navKey: item.key } },
      update: { visible },
      create: { role, navKey: item.key, visible },
    });
  }

  revalidatePath("/admin/access");
  revalidatePath("/admin");
  return { ok: true };
}
