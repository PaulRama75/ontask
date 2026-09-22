"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

// Persistent (reusable) token for the employee's own timesheet-only portal.
// Generating again always issues a brand new token -- a revoked or
// previously-shared link never becomes valid again.
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
  revalidatePath(`/admin/employee/${employeeId}`);
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
