"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { ROLES, isAdminRole, ROLE_LABELS, type Role } from "@/lib/rbac";
import { sendEmail, emailButton } from "@/lib/email";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

// Deleting a user (unlike role changes / activation) is restricted to
// Super Admin, same tier as who can see Access Control.
async function requireSuperAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "SUPER_ADMIN") throw new Error("Not authorized");
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

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/login`;
  const greeting = name ? `Hi ${name},` : "Hello,";
  await sendEmail({
    to: email,
    subject: "Your FER account is ready",
    html: `<p>${greeting}</p>
<p>An account has been created for you on the FER Employee Onboarding system as <strong>${ROLE_LABELS[role as Role] ?? role}</strong>.</p>
${emailButton(url, "Sign In")}
<p>Username: ${email}<br>Password: ${password}</p>
<p>Please sign in and change your password when you get a chance.</p>`,
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

export async function deleteUser(form: FormData): Promise<void> {
  const me = await requireSuperAdmin();
  const id = String(form.get("userId") ?? "");
  if (!id || id === me.id) return; // can't delete yourself
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}

// Designates the single recipient for admin-facing invoice notifications
// (final-approval alerts, "Email Admins" nudges). Clears the flag on
// everyone else first so only one user ever has it set.
export async function setInvoiceAdminRecipient(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  if (!id) return;
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { receivesInvoiceAdminEmails: true },
      data: { receivesInvoiceAdminEmails: false },
    }),
    prisma.user.update({ where: { id }, data: { receivesInvoiceAdminEmails: true } }),
  ]);
  revalidatePath("/admin/users");
}

// Clears the designated recipient entirely, reverting invoice admin
// notifications to every active ADMIN/SUPER_ADMIN.
export async function clearInvoiceAdminRecipient(): Promise<void> {
  await requireAdmin();
  await prisma.user.updateMany({
    where: { receivesInvoiceAdminEmails: true },
    data: { receivesInvoiceAdminEmails: false },
  });
  revalidatePath("/admin/users");
}
