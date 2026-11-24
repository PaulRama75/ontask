"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, requirePin } from "@/lib/auth";
import { isAdminRole, getRoleOptions, isValidRole } from "@/lib/rbac";
import { sendEmail, emailButton } from "@/lib/email";
import { revalidatePath } from "next/cache";
import type { GatedResult } from "@/lib/gatedResult";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

// Shared PIN step for the gated user actions below. Maps requirePin's failure
// union onto the GatedResult channel (NO_PIN -> pinRequired). Returns null on
// success so the caller proceeds with the mutation.
async function checkPin(form: FormData): Promise<{ ok: false; error: string; pinRequired?: boolean } | null> {
  const pin = await requirePin(String(form.get("pin") ?? ""));
  if (!pin.ok) return { ok: false, error: pin.error, pinRequired: pin.code === "NO_PIN" };
  return null;
}

export type UserActionResult = { ok: boolean; error?: string };

export async function createUser(form: FormData): Promise<UserActionResult> {
  await requireAdmin();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim() || null;
  const role = String(form.get("role") ?? "");
  const password = String(form.get("password") ?? "");

  if (!email || !password) return { ok: false, error: "Email and password are required." };
  if (!(await isValidRole(role, { activeOnly: true })))
    return { ok: false, error: "Invalid role." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { ok: false, error: "A user with that email already exists." };

  await prisma.user.create({
    data: { email, name, role, passwordHash: hashPassword(password) },
  });

  const roleLabel = (await getRoleOptions()).find((r) => r.key === role)?.label ?? role;
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/login`;
  const greeting = name ? `Hi ${name},` : "Hello,";
  await sendEmail({
    to: email,
    subject: "Your FER account is ready",
    html: `<p>${greeting}</p>
<p>An account has been created for you on the FER Employee Onboarding system as <strong>${roleLabel}</strong>.</p>
${emailButton(url, "Sign In")}
<p>Username: ${email}<br>Password: ${password}</p>
<p>Please sign in and change your password when you get a chance.</p>`,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRole(form: FormData): Promise<GatedResult> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) return { ok: false, error: "Not authorized" };
  const pinFail = await checkPin(form);
  if (pinFail) return pinFail;
  const id = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "");
  if (!id || !(await isValidRole(role, { activeOnly: true }))) return { ok: false, error: "Invalid role." };
  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(form: FormData): Promise<GatedResult> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) return { ok: false, error: "Not authorized" };
  const pinFail = await checkPin(form);
  if (pinFail) return pinFail;
  const id = String(form.get("userId") ?? "");
  const active = String(form.get("active") ?? "") === "true";
  if (!id || id === me.id) return { ok: false, error: "You can't change your own status." }; // can't disable yourself
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUser(form: FormData): Promise<GatedResult> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) return { ok: false, error: "Not authorized" };
  const pinFail = await checkPin(form);
  if (pinFail) return pinFail;
  const id = String(form.get("userId") ?? "");
  if (!id || id === me.id) return { ok: false, error: "You can't delete yourself." }; // can't delete yourself
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
  return { ok: true };
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

// Designates the single recipient for onboarding-submission notifications.
// Same single-recipient convention as setInvoiceAdminRecipient above.
export async function setOnboardingHrRecipient(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  if (!id) return;
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { receivesOnboardingHrEmails: true },
      data: { receivesOnboardingHrEmails: false },
    }),
    prisma.user.update({ where: { id }, data: { receivesOnboardingHrEmails: true } }),
  ]);
  revalidatePath("/admin/users");
}

// Clears the designated recipient entirely, reverting onboarding-submission
// notifications to every active HR user.
export async function clearOnboardingHrRecipient(): Promise<void> {
  await requireAdmin();
  await prisma.user.updateMany({
    where: { receivesOnboardingHrEmails: true },
    data: { receivesOnboardingHrEmails: false },
  });
  revalidatePath("/admin/users");
}

// Grants this user full view/download access to every employee's
// documents, regardless of role. Unlike the notification recipients
// above, this isn't a single-recipient field -- any number of users can
// have it set at once.
export async function grantFullDocumentAccess(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  if (!id) return;
  await prisma.user.update({ where: { id }, data: { hasFullDocumentAccess: true } });
  revalidatePath("/admin/users");
}

export async function revokeFullDocumentAccess(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  if (!id) return;
  await prisma.user.update({ where: { id }, data: { hasFullDocumentAccess: false } });
  revalidatePath("/admin/users");
}

// Adds a new role to the roles table (from the "Add new role" popup on the
// Users page). The key stored on users is derived from the name, e.g.
// "Site Supervisor" -> "SITE_SUPERVISOR". New roles start with the same
// minimal default access as Employee until set on the Access Control page.
export async function createRole(
  form: FormData,
): Promise<{ ok: boolean; error?: string; role?: { key: string; label: string; status: string } }> {
  await requireAdmin();
  const roleName = String(form.get("roleName") ?? "").trim().replace(/\s+/g, " ");
  const status = String(form.get("status") ?? "ACTIVE");
  if (!roleName) return { ok: false, error: "Role name is required." };
  if (roleName.length > 50) return { ok: false, error: "Role name must be 50 characters or less." };
  if (status !== "ACTIVE" && status !== "INACTIVE") return { ok: false, error: "Invalid status." };
  const key = roleName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) return { ok: false, error: "Role name must contain letters or numbers." };

  const existing = await getRoleOptions();
  if (existing.some((r) => r.key === key || r.label.toLowerCase() === roleName.toLowerCase()))
    return { ok: false, error: "A role with that name already exists." };

  await prisma.role.create({ data: { key, roleName, status } });
  revalidatePath("/admin/users");
  revalidatePath("/admin/access");
  return { ok: true, role: { key, label: roleName, status } };
}
