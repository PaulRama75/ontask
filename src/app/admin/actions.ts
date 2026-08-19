"use server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { saveFile } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import { getAccessMap, canEdit, canApprove } from "@/lib/rbac";

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

  // An email is required so the new employee can be sent their onboarding link.
  if (!email) throw new Error("An employee email is required to send the onboarding link.");

  const employee = await prisma.employee.create({
    data: { firstName, lastName, email, projectLeadEmail, status: "DRAFT", source: "LINK" },
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
<p><a href="${url}">${url}</a></p>
<p>You'll be asked for your personal details and to upload a few documents. The link is unique to you — please don't share it.</p>`,
  });

  revalidatePath("/admin");
}

async function requireColumn(
  columnKey: string,
  mode: "edit" | "approve",
): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const access = await getAccessMap(me.role);
  const ok = mode === "approve" ? canApprove(access, columnKey) : canEdit(access, columnKey);
  if (!ok) throw new Error("Not authorized for this column");
}

// Toggle overall approval for an employee. Phase 3 replaces this with
// per-column approval by the responsible role.
export async function setApproved(formData: FormData): Promise<void> {
  await requireColumn("approved", "approve");
  const id = String(formData.get("employeeId") ?? "");
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

// Project Lead: set the employee's job site.
export async function setSite(formData: FormData): Promise<void> {
  await requireColumn("site", "edit");
  const id = String(formData.get("employeeId") ?? "");
  if (!id) return;
  const site = String(formData.get("site") ?? "").trim();
  await prisma.employee.update({
    where: { id },
    data: { site: site || null },
  });
  revalidatePath("/admin/grid");
}

// Project Lead: set the employee's pay or bill rate.
export async function setRate(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  const field = String(formData.get("field") ?? "");
  if (!id || (field !== "payRate" && field !== "billRate")) return;
  await requireColumn(field, "edit");
  const raw = String(formData.get("value") ?? "").trim();
  const parsed = raw === "" ? null : Number(raw);
  const value = parsed === null || Number.isNaN(parsed) ? null : parsed;
  await prisma.employee.update({
    where: { id },
    data: { [field]: value },
  });
  revalidatePath("/admin/grid");
}

// Inline grid editing of a single employee field/column. The access map
// (canEdit on the column key) gates who may write each column.
export async function setEmployeeField(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  const column = String(formData.get("column") ?? "");
  if (!id) return;
  await requireColumn(column, "edit");

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
  await requireColumn(column, "edit");

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
  const saved = await saveFile(buffer, file.name, { employeeName, employeeId: id, category });

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
  await requireColumn(column, "edit");
  const value = triBool(String(formData.get("value") ?? ""));
  await prisma.employee.update({ where: { id }, data: { [field]: value } });
  revalidatePath("/admin/grid");
}

// Project Lead: set FRC need + size together.
export async function setFrc(formData: FormData): Promise<void> {
  const id = String(formData.get("employeeId") ?? "");
  if (!id) return;
  await requireColumn("frc", "edit");
  const frcNeeded = triBool(String(formData.get("needed") ?? ""));
  const sizeRaw = String(formData.get("size") ?? "").trim();
  await prisma.employee.update({
    where: { id },
    data: { frcNeeded, frcSize: sizeRaw === "" ? null : sizeRaw },
  });
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
  if (canEdit(access, "site")) data.site = s("site") || null;
  if (canEdit(access, "hireDate")) data.hireDate = dateOrNull(s("hireDate"));
  if (canEdit(access, "payRate")) data.payRate = numOrNull(s("payRate"));
  if (canEdit(access, "billRate")) data.billRate = numOrNull(s("billRate"));
  if (canEdit(access, "frc")) {
    data.frcNeeded = triBool(s("frcNeeded"));
    data.frcSize = s("frcSize") || null;
  }
  if (canEdit(access, "creditCard")) data.creditCardApproved = triBool(s("creditCardApproved"));
  if (canEdit(access, "emailNeeded")) data.emailNeeded = triBool(s("emailNeeded"));

  // Job assignment fields aren't individually access-controlled -- they're one
  // cohesive block, gated the same way the section itself is: anyone who can
  // edit at least one existing PL field can edit all of these too.
  const canEditPL = ["site", "hireDate", "payRate", "billRate", "frc", "creditCard", "emailNeeded"].some(
    (k) => canEdit(access, k),
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
  }
  revalidatePath("/admin/grid");
  revalidatePath(`/admin/employee/${id}`);
}

// Project Lead: toggle active / inactive.
export async function setActive(formData: FormData): Promise<void> {
  await requireColumn("active", "edit");
  const id = String(formData.get("employeeId") ?? "");
  if (!id) return;
  const active = String(formData.get("active") ?? "") === "true";
  await prisma.employee.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/grid");
}

export async function setArchived(formData: FormData): Promise<void> {
  await requireColumn("archived", "edit");
  const id = String(formData.get("employeeId") ?? "");
  if (!id) return;
  const archived = String(formData.get("archived") ?? "") === "true";
  await prisma.employee.update({
    where: { id },
    data: { archived },
  });
  revalidatePath("/admin/grid");
}
