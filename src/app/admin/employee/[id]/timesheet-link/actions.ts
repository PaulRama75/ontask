"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { sendEmail, emailButton } from "@/lib/email";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

async function emailTimesheetLink(employeeId: string, token: string): Promise<void> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { firstName: true, email: true },
  });
  if (!e?.email) return;
  const url = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/timesheet/${token}`;
  await sendEmail({
    to: e.email,
    subject: "Your FER timesheet link",
    html: `<p>${e.firstName ? `Hi ${e.firstName},` : "Hello,"}</p>
<p>Use the link below to enter your weekly time and expenses. No password is needed, so please bookmark it and keep it to yourself.</p>
${emailButton(url, "Open my timesheet")}`,
  });
}

// Persistent (reusable) token for the employee's own timesheet-only portal.
// Generating again always issues a brand new token -- a revoked or
// previously-shared link never becomes valid again. The new link is emailed
// to the employee straight away.
export async function generateTimesheetLink(form: FormData): Promise<void> {
  await requireAdmin();
  const employeeId = String(form.get("employeeId") ?? "");
  if (!employeeId) return;
  const token = nanoid(32);
  await prisma.employeeTimesheetToken.upsert({
    where: { employeeId },
    update: { token, revokedAt: null, createdAt: new Date() },
    create: { employeeId, token },
  });
  await emailTimesheetLink(employeeId, token);
  revalidatePath(`/admin/employee/${employeeId}`);
}

export async function resendTimesheetLink(form: FormData): Promise<void> {
  await requireAdmin();
  const employeeId = String(form.get("employeeId") ?? "");
  const link = await prisma.employeeTimesheetToken.findUnique({ where: { employeeId } });
  if (!link || link.revokedAt) return;
  await emailTimesheetLink(employeeId, link.token);
}

export async function revokeTimesheetLink(form: FormData): Promise<void> {
  await requireAdmin();
  const employeeId = String(form.get("employeeId") ?? "");
  if (!employeeId) return;
  await prisma.employeeTimesheetToken.update({
    where: { employeeId },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/admin/employee/${employeeId}`);
}
