"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { ROLES, isAdminRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

export type UserActionResult = { ok: boolean; error?: string };

export async function createUser(form: FormData): Promise<UserActionResult> {
  await requireAdmin();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim() || null;
  const role = String(form.get("role") ?? "");
  const password = String(form.get("password") ?? "");

  if (!email || !password) return { ok: false, error: "Email and password are required." };
  if (!ROLES.includes(role as (typeof ROLES)[number]))
    return { ok: false, error: "Invalid role." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { ok: false, error: "A user with that email already exists." };

  await prisma.user.create({
    data: { email, name, role, passwordHash: hashPassword(password) },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRole(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "");
  if (!id || !ROLES.includes(role as (typeof ROLES)[number])) return;
  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/admin/users");
}

export async function setUserActive(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(form.get("userId") ?? "");
  const active = String(form.get("active") ?? "") === "true";
  if (!id || id === me.id) return; // can't disable yourself
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/admin/users");
}
