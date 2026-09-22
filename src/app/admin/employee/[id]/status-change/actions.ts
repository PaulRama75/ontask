"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, isAssignedProjectLeadOrManager } from "@/lib/rbac";
import { notifyStatusChangeSubmitted } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

const str = (form: FormData, key: string): string | null => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const bool = (form: FormData, key: string): boolean | null => {
  const v = str(form, key);
  return v === "true" ? true : v === "false" ? false : null;
};
const dateOrNull = (form: FormData, key: string): Date | null => {
  const v = str(form, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Third step of the onboarding flow, after Project Lead Details: a PL/PM
// (assigned to this employee) or an Admin/Super Admin records a status
// change. `newSite` -- if given -- is applied onto Employee.site so the
// grid reflects it immediately.
export async function submitStatusChange(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");

  const employeeId = String(form.get("employeeId") ?? "");
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { projectLeadEmail: true, projectManagerEmail: true, createdById: true },
  });
  if (!employee) throw new Error("Employee not found");
  if (!isAdminRole(me.role) && !isAssignedProjectLeadOrManager(me, employee)) {
    throw new Error("Not authorized for this employee");
  }

  const employmentType = form.getAll("employmentType").map(String).join(", ") || null;
  const newSite = str(form, "newSite");

  const data = {
    employeeId,
    effectiveDate: dateOrNull(form, "effectiveDate"),
    reasonForChange: str(form, "reasonForChange"),
    employmentType,
    fromJobNumber: str(form, "fromJobNumber"),
    toJobNumber: str(form, "toJobNumber"),
    newSite,
    detailsOfChange: str(form, "detailsOfChange"),
    drivingRecordRequired: bool(form, "drivingRecordRequired"),
    creditCardRequested: bool(form, "creditCardRequested"),
    creditCardApprovedByGm: bool(form, "creditCardApprovedByGm"),
    deactivateEmailAccess: bool(form, "deactivateEmailAccess"),
    deactivateAmexCard: bool(form, "deactivateAmexCard"),
    requestingManagerName: str(form, "requestingManagerName"),
    submittedByUserId: me.id,
    submittedByName: me.name || me.email,
  };

  await prisma.$transaction([
    prisma.statusChangeRequest.create({ data }),
    ...(newSite ? [prisma.employee.update({ where: { id: employeeId }, data: { site: newSite } })] : []),
  ]);

  await notifyStatusChangeSubmitted(employeeId, me, data);

  revalidatePath(`/admin/employee/${employeeId}`);
  revalidatePath("/admin/grid");
}
