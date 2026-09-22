"use server";

import { prisma } from "@/lib/prisma";
import { sendEmail, emailButton } from "@/lib/email";
import { saveFile, deleteFile } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import { getAccessMap, canEdit, canApprove, isAdminRole, isAssignedProjectLeadOrManager } from "@/lib/rbac";
import { notifyFlagTransitions, notifyProjectLeadDetailsSaved } from "@/lib/notifications";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

// Grid column key -> document category. Only these columns carry attachments.
const COLUMN_CATEGORY: Record<string, string> = {
  driverLicense: "LICENSE",
  safetyExpiry: "SAFETY_COUNCIL",
  twicExpiry: "TWIC",
  certification: "CERTIFICATION",
  utilityBill: "UTILITY_BILL",
};

export async function createOnboardingLink(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");

  const firstName = String(form.get("firstName") ?? "").trim() || null;
  const lastName = String(form.get("lastName") ?? "").trim() || null;
  const email = String(form.get("email") ?? "").trim() || null;
  const projectLeadEmail = String(form.get("projectLeadEmail") ?? "").trim() || null;
  const projectManagerEmail = String(form.get("projectManagerEmail") ?? "").trim() || null;

  // An email is required so the new employee can be sent their onboarding link.
  if (!email) throw new Error("An employee email is required to send the onboarding link.");

  const employee = await prisma.employee.create({
    data: {
      firstName,
      lastName,
      email,
      projectLeadEmail,
      projectManagerEmail,
      createdById: me.id,
      status: "DRAFT",
      source: "LINK",
    },
  });

  const token = nanoid(24);
  await prisma.onboardingLink.create({
    data: { token, employeeId: employee.id },
  });

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/onboard/${token}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  await sendEmail({
    to: email,
    subject: "Complete your FER onboarding",
    html: `<p>${greeting}</p>
<p>Welcome to FER! Please complete your onboarding using the secure link below:</p>
${emailButton(url, "Complete Onboarding")}
<p>You'll be asked for your personal details and to upload a few documents. The link is unique to you — please don't share it.</p>`,
  });

  revalidatePath("/admin");
}

async function requireColumn(
  columnKey: string,
  mode: "edit" | "approve",
  employeeId?: string,
): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const access = await getAccessMap(me.role);
  const ok = mode === "approve" ? canApprove(access, columnKey) : canEdit(access, columnKey);
  if (!ok) throw new Error("Not authorized for this column");

  // Project Leads/Managers may only touch employees they created or are
  // assigned to -- same scope the data grid shows them.
  if (employeeId && (me.role === "PROJECT_LEAD" || me.role === "PROJECT_MANAGER")) {
    const e = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { projectLeadEmail: true, projectManagerEmail: true, createdById: true },
    });
    if (!e || !isAssignedProjectLeadOrManager(me, e)) {
      throw new Error("Not authorized for this employee");
    }
  }
}

// Toggle overall approval for an employee. Phase 3 replaces this with
// per-column approval by the responsible role.
export async function setApproved(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (id) await requireColumn("approved", "approve", id);
  const approved = String(formData.get("approved") ?? "") === "true";
  if (!id) return;

  await prisma.employee.update({
    where: { id },
    data: {
      approved,
      approvedAt: approved ? new Date() : null,
      status: approved ? "APPROVED" : "SUBMITTED",
    },
  });

  revalidatePath("/admin/grid");
}

// HR's review checkpoint. Only crosses the SUBMITTED <-> HR_REVIEW boundary --
// never clobbers RATES_ASSIGNED/APPROVED, so a later un-check doesn't undo
// progress that's already moved on.
export async function setHrReviewed(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (id) await requireColumn("hrReviewed", "approve", id);
  const reviewed = String(formData.get("hrReviewed") ?? "") === "true";
  if (!id) return;

  const employee = await prisma.employee.findUnique({ where: { id }, select: { status: true } });
  if (!employee) return;

  const data: Record<string, unknown> = {
    hrReviewed: reviewed,
    hrReviewedAt: reviewed ? new Date() : null,
  };
  if (reviewed && employee.status === "SUBMITTED") {
    data.status = "HR_REVIEW";
  } else if (!reviewed && employee.status === "HR_REVIEW") {
    data.status = "SUBMITTED";
  }

  await prisma.employee.update({ where: { id }, data });
  revalidatePath("/admin/grid");
}

// Project Lead: set the employee's job site.
export async function setSite(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (id) await requireColumn("site", "edit", id);
  if (!id) return;
  const site = String(formData.get("site") ?? "").trim();
  await prisma.employee.update({
    where: { id },
    data: { site: site || null },
  });
  revalidatePath("/admin/grid");
}

// Keeps status in sync with pay/bill rate: RATES_ASSIGNED once both are set
// (from either SUBMITTED or HR_REVIEW -- rates and HR review can happen in
// either order), reverting to HR_REVIEW/SUBMITTED if a rate gets cleared
// again. Never touches APPROVED -- already signed off.
async function syncRatesStatus(id: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { status: true, payRate: true, billRate: true, hrReviewed: true },
  });
  if (!employee) return;
  const bothSet = employee.payRate != null && employee.billRate != null;
  if (bothSet && (employee.status === "SUBMITTED" || employee.status === "HR_REVIEW")) {
    await prisma.employee.update({
      where: { id },
      data: { status: "RATES_ASSIGNED", ratesAssignedAt: new Date() },
    });
  } else if (!bothSet && employee.status === "RATES_ASSIGNED") {
    await prisma.employee.update({
      where: { id },
      data: { status: employee.hrReviewed ? "HR_REVIEW" : "SUBMITTED", ratesAssignedAt: null },
    });
  }
}

// Project Lead: set the employee's pay or bill rate.
export async function setRate(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  const field = String(formData.get("field") ?? "");
  if (!id || (field !== "payRate" && field !== "billRate")) return;
  await requireColumn(field, "edit", id);
  const raw = String(formData.get("value") ?? "").trim();
  const parsed = raw === "" ? null : Number(raw);
  const value = parsed === null || Number.isNaN(parsed) ? null : parsed;
  await prisma.employee.update({
    where: { id },
    data: { [field]: value },
  });
  await syncRatesStatus(id);
  revalidatePath("/admin/grid");
}

// Inline grid editing of a single employee field/column. The access map
// (canEdit on the column key) gates who may write each column.
export async function setEmployeeField(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  const column = String(formData.get("column") ?? "");
  if (!id) return;
  await requireColumn(column, "edit", id);

  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const orNull = (v: string) => (v === "" ? null : v);
  const dateOrNull = (v: string) => {
    if (v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  let data: Record<string, unknown>;
  switch (column) {
    case "name":
      data = { firstName: orNull(str("firstName")), lastName: orNull(str("lastName")) };
      break;
    case "email":
      data = { email: orNull(str("value").toLowerCase()) };
      break;
    case "phone":
      data = { phone: orNull(str("value")) };
      break;
    case "ssn":
      data = { ssn: orNull(str("value")) };
      break;
    case "driverLicense":
      data = { driversLicenseNumber: orNull(str("value")) };
      break;
    case "safetyExpiry":
      data = { safetyCouncilExpiry: dateOrNull(str("value")) };
      break;
    case "twicExpiry":
      data = { twicExpiry: dateOrNull(str("value")) };
      break;
    case "hireDate":
      data = { hireDate: dateOrNull(str("value")) };
      break;
    case "address":
      data = {
        addressLine1: orNull(str("addressLine1")),
        addressLine2: orNull(str("addressLine2")),
        city: orNull(str("city")),
        state: orNull(str("state")),
        zip: orNull(str("zip")),
      };
      break;
    default:
      return;
  }

  await prisma.employee.update({ where: { id }, data });
  revalidatePath("/admin/grid");
}

// Attach a document to an employee from the data grid. The column key both
// gates write access (canEdit) and maps to the storage category.
export async function addEmployeeDocument(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  const column = String(formData.get("column") ?? "");
  const category = COLUMN_CATEGORY[column];
  if (!id || !category) return;
  await requireColumn(column, "edit", id);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 15 MB limit.`);
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error(`"${file.name}" must be a PDF or image.`);
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  if (!employee) return;
  const employeeName = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ");

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveFile(buffer, file.name, {
    employeeName,
    employeeId: id,
    category,
    mimeType: file.type,
  });

  const title = String(formData.get("label") ?? "").trim();

  await prisma.document.create({
    data: {
      employeeId: id,
      category,
      label: title || file.name,
      fileName: file.name,
      storageKey: saved.storageKey,
      mimeType: file.type || "application/octet-stream",
      size: saved.size,
    },
  });

  revalidatePath("/admin/grid");
}

// Admin-only: rename an uploaded document's display file name (extra/wrongly
// labeled attachments happen during onboarding uploads). Does not touch the
// underlying storage key, only what's shown to users.
export async function renameEmployeeDocument(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  const documentId = String(formData.get("documentId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const fileName = String(formData.get("fileName") ?? "").trim();
  if (!documentId || !fileName) return;

  await prisma.document.update({ where: { id: documentId }, data: { fileName } });
  revalidatePath("/admin/grid");
  if (employeeId) revalidatePath(`/admin/employee/${employeeId}`);
}

// Admin-only: permanently remove an uploaded document (storage file + DB row).
export async function deleteEmployeeDocument(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  const documentId = String(formData.get("documentId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!documentId) return;

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await deleteFile(doc.storageKey);
  await prisma.document.delete({ where: { id: documentId } });
  revalidatePath("/admin/grid");
  if (employeeId) revalidatePath(`/admin/employee/${employeeId}`);
}

// Tri-state boolean from a form value: "true" -> true, "false" -> false, else null.
function triBool(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

// Grid column key -> employee boolean field, for the yes/no flag columns.
const FLAG_FIELD: Record<string, string> = {
  creditCard: "creditCardApproved",
  emailNeeded: "emailNeeded",
};

// Project Lead: set a yes/no flag (credit card approved, email needed).
export async function setEmployeeFlag(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  const column = String(formData.get("column") ?? "");
  const field = FLAG_FIELD[column];
  if (!id || !field) return;
  await requireColumn(column, "edit", id);
  const value = triBool(String(formData.get("value") ?? ""));
  const before = await prisma.employee.findUnique({
    where: { id },
    select: { frcNeeded: true, emailNeeded: true, creditCardApproved: true },
  });
  await prisma.employee.update({ where: { id }, data: { [field]: value } });
  if (before) await notifyFlagTransitions(id, before, { [field]: value });
  revalidatePath("/admin/grid");
}

// Project Lead: set FRC need + size together.
export async function setFrc(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (id) await requireColumn("frc", "edit", id);
  if (!id) return;
  const frcNeeded = triBool(String(formData.get("needed") ?? ""));
  const sizeRaw = String(formData.get("size") ?? "").trim();
  const before = await prisma.employee.findUnique({
    where: { id },
    select: { frcNeeded: true, emailNeeded: true, creditCardApproved: true },
  });
  await prisma.employee.update({
    where: { id },
    data: { frcNeeded, frcSize: sizeRaw === "" ? null : sizeRaw },
  });
  if (before) await notifyFlagTransitions(id, before, { frcNeeded });
  revalidatePath("/admin/grid");
}

// Grouped Project Lead form (employee page). Saves only the fields the current
// role may edit; each PL field is gated by its own access key.
export async function saveProjectLeadDetails(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const id = String(formData.get("employeeId") ?? "");
  if (!id) return;
  const access = await getAccessMap(me.role);

  // A Project Lead/Manager assigned to this employee gets full edit rights
  // on their PL details, same as the role-wide Access Control matrix would
  // grant -- matches the same rule enforced when the form is rendered.
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      projectLeadEmail: true,
      projectManagerEmail: true,
      createdById: true,
      frcNeeded: true,
      emailNeeded: true,
      creditCardApproved: true,
    },
  });
  if (!employee) return;
  const assignedToMe = isAssignedProjectLeadOrManager(me, employee);
  const editable = (key: string) => canEdit(access, key) || assignedToMe;

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const numOrNull = (v: string) => {
    const n = v === "" ? null : Number(v);
    return n === null || Number.isNaN(n) ? null : n;
  };
  const dateOrNull = (v: string) => {
    if (v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const data: Record<string, unknown> = {};
  if (editable("site")) data.site = s("site") || null;
  if (editable("hireDate")) data.hireDate = dateOrNull(s("hireDate"));
  if (editable("payRate")) data.payRate = numOrNull(s("payRate"));
  if (editable("billRate")) data.billRate = numOrNull(s("billRate"));
  if (editable("frc")) {
    data.frcNeeded = triBool(s("frcNeeded"));
    data.frcSize = s("frcSize") || null;
  }
  if (editable("creditCard")) data.creditCardApproved = triBool(s("creditCardApproved"));
  if (editable("emailNeeded")) data.emailNeeded = triBool(s("emailNeeded"));

  // Job assignment fields aren't individually access-controlled -- they're one
  // cohesive block, gated the same way the section itself is: anyone who can
  // edit at least one existing PL field (or is personally assigned) can edit
  // all of these too.
  const canEditPL = ["site", "hireDate", "payRate", "billRate", "frc", "creditCard", "emailNeeded"].some(
    (k) => editable(k),
  );
  if (canEditPL) {
    const csv = (key: string) => formData.getAll(key).map(String).join(", ") || null;
    data.urgency = s("urgency") || null;
    data.employmentType = csv("employmentType");
    data.positionType = csv("positionType");
    data.directSupervisor = s("directSupervisor") || null;
    data.jobNumber = s("jobNumber") || null;
    data.jobSite = s("jobSite") || null;
    data.drivingRecordRequired = triBool(s("drivingRecordRequired"));
    data.liftOperatorCertifications = s("liftOperatorCertifications") || null;
    data.siteSpecificsNeeded = triBool(s("siteSpecificsNeeded"));
    data.fitTestNeeded = triBool(s("fitTestNeeded"));
    data.additionalTrainingsNeeded = s("additionalTrainingsNeeded") || null;
    data.safetyEquipmentNeeded = csv("safetyEquipmentNeeded");
    data.additionalEquipmentNeeds = s("additionalEquipmentNeeds") || null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.employee.update({ where: { id }, data });
    await notifyFlagTransitions(id, employee, {
      frcNeeded: data.frcNeeded as boolean | null | undefined,
      emailNeeded: data.emailNeeded as boolean | null | undefined,
      creditCardApproved: data.creditCardApproved as boolean | null | undefined,
    });
    await notifyProjectLeadDetailsSaved(id, me);
  }
  if ("payRate" in data || "billRate" in data) {
    await syncRatesStatus(id);
  }
  revalidatePath("/admin/grid");
  revalidatePath(`/admin/employee/${id}`);
}

// Assign (or clear) the Project Lead / Project Manager on an existing
// employee from the Onboarding list. Admin, Super Admin and HR only.
export async function assignProjectContact(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !(isAdminRole(me.role) || me.role === "HR")) throw new Error("Not authorized");
  const id = String(formData.get("employeeId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const email = String(formData.get("email") ?? "").trim() || null;
  if (!id || (kind !== "PL" && kind !== "PM")) return;
  await prisma.employee.update({
    where: { id },
    data: kind === "PL" ? { projectLeadEmail: email } : { projectManagerEmail: email },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/grid");
}

// Project Lead: toggle active / inactive.
export async function setActive(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (id) await requireColumn("active", "edit", id);
  if (!id) return;
  const active = String(formData.get("active") ?? "") === "true";
  await prisma.employee.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/grid");
}

export async function setArchived(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (id) await requireColumn("archived", "edit", id);
  if (!id) return;
  const archived = String(formData.get("archived") ?? "") === "true";
  await prisma.employee.update({
    where: { id },
    data: { archived },
  });
  revalidatePath("/admin/grid");
}

// Permanently removes an employee record (and, via cascade, their
// certifications, documents, and onboarding link). Admin-only -- unlike
// archive, this can't be undone.
export async function deleteEmployee(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  const id = String(formData.get("employeeId") ?? "");
  if (!id) return;
  await prisma.employee.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/admin/grid");
}

// Admin-only one-off share: lets a specific user view/download one
// employee's documents regardless of their role's default access or any
// Project Lead/Manager assignment. Never implies edit rights.
export async function grantDocumentAccess(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  const employeeId = String(formData.get("employeeId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!employeeId || !userId) return;

  await prisma.employeeDocumentGrant.upsert({
    where: { employeeId_userId: { employeeId, userId } },
    update: {},
    create: { employeeId, userId, grantedById: me.id },
  });
  revalidatePath(`/admin/employee/${employeeId}`);
}

export async function revokeDocumentAccess(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  const employeeId = String(formData.get("employeeId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!employeeId || !userId) return;

  await prisma.employeeDocumentGrant.deleteMany({ where: { employeeId, userId } });
  revalidatePath(`/admin/employee/${employeeId}`);
}
