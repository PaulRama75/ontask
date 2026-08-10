"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getAccessMap, canView, COLUMNS, COLUMN_KEYS } from "@/lib/rbac";
import { saveInvoiceFile, getFile } from "@/lib/storage";
import { sendEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requirePM() {
  const me = await getCurrentUser();
  if (!me || me.role !== "PROJECT_MANAGER") throw new Error("Not authorized");
  return me;
}

async function requireAM() {
  const me = await getCurrentUser();
  if (!me || (me.role !== "ACCOUNT_MANAGER" && !isAdminRole(me.role))) throw new Error("Not authorized");
  return me;
}

async function requireAdminUser() {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) throw new Error("Not authorized");
  return me;
}

export type CreateInvoiceResult = { ok: false; error: string } | undefined;

export async function createInvoice(
  _prev: CreateInvoiceResult,
  form: FormData,
): Promise<CreateInvoiceResult> {
  const me = await requirePM();

  const site = String(form.get("site") ?? "").trim();
  const clientName = String(form.get("clientName") ?? "").trim();
  const clientEmail = String(form.get("clientEmail") ?? "").trim().toLowerCase();

  if (!site) return { ok: false, error: "Site is required." };
  if (!clientName || !clientEmail) {
    return { ok: false, error: "Client name and email are required." };
  }

  let client = await prisma.client.findFirst({ where: { site, email: clientEmail } });
  if (!client) {
    client = await prisma.client.create({ data: { name: clientName, email: clientEmail, site } });
  }

  const invoice = await prisma.invoice.create({
    data: { clientId: client.id, site, status: "DRAFT", createdByUserId: me.id },
  });

  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${invoice.id}`);
}

export async function addLineItem(form: FormData): Promise<void> {
  const me = await requirePM();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const amount = Number(form.get("amount") ?? "");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");
  if (!description) throw new Error("A description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");

  await prisma.invoiceLineItem.create({ data: { invoiceId, description, amount } });
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

export async function deleteLineItem(form: FormData): Promise<void> {
  const me = await requirePM();
  const id = String(form.get("lineItemId") ?? "");
  const lineItem = await prisma.invoiceLineItem.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!lineItem) return;
  if (lineItem.invoice.createdByUserId !== me.id) throw new Error("Not authorized");
  if (lineItem.invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");
  await prisma.invoiceLineItem.delete({ where: { id } });
  revalidatePath(`/admin/invoices/${lineItem.invoiceId}`);
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export async function uploadInvoiceAttachment(form: FormData): Promise<void> {
  const me = await requirePM();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const category = String(form.get("category") ?? "OTHER");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`"${file.name}" exceeds the 15 MB limit.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveInvoiceFile(buffer, file.name, { invoiceId, category });

  await prisma.invoiceAttachment.create({
    data: {
      invoiceId,
      category,
      fileName: file.name,
      storageKey: saved.storageKey,
      mimeType: file.type || "application/octet-stream",
      size: saved.size,
    },
  });

  revalidatePath(`/admin/invoices/${invoiceId}`);
}

export async function deleteInvoiceAttachment(form: FormData): Promise<void> {
  const me = await requirePM();
  const id = String(form.get("attachmentId") ?? "");
  const att = await prisma.invoiceAttachment.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!att) return;
  if (att.invoice.createdByUserId !== me.id) throw new Error("Not authorized");
  if (att.invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");
  await prisma.invoiceAttachment.delete({ where: { id } });
  revalidatePath(`/admin/invoices/${att.invoiceId}`);
}

const EXPORT_KEYS = COLUMN_KEYS.filter((k) => k !== "library");

function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

type ExportEmployee = {
  firstName: string | null;
  lastName: string | null;
  site: string | null;
  active: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
  ssn: string | null;
  driversLicenseNumber: string | null;
  safetyCouncilExpiry: Date | null;
  twicExpiry: Date | null;
  certifications: { name: string }[];
  payRate: number | null;
  billRate: number | null;
  hireDate: Date | null;
  frcNeeded: boolean | null;
  frcSize: string | null;
  creditCardApproved: boolean | null;
  emailNeeded: boolean | null;
  approved: boolean;
};

function employeeFieldValue(e: ExportEmployee, key: string): string {
  switch (key) {
    case "name":
      return [e.firstName, e.lastName].filter(Boolean).join(" ");
    case "site":
      return e.site ?? "";
    case "active":
      return e.active ? "Active" : "Inactive";
    case "address":
      return [e.addressLine1, e.addressLine2, e.city, e.state, e.zip].filter(Boolean).join(", ");
    case "email":
      return e.email ?? "";
    case "phone":
      return e.phone ?? "";
    case "ssn":
      return e.ssn ?? "";
    case "driverLicense":
      return e.driversLicenseNumber ?? "";
    case "safetyExpiry":
      return e.safetyCouncilExpiry ? e.safetyCouncilExpiry.toISOString().slice(0, 10) : "";
    case "twicExpiry":
      return e.twicExpiry ? e.twicExpiry.toISOString().slice(0, 10) : "";
    case "certification":
      return e.certifications.map((c) => c.name).join("; ");
    case "utilityBill":
      return "";
    case "payRate":
      return e.payRate != null ? e.payRate.toFixed(2) : "";
    case "billRate":
      return e.billRate != null ? e.billRate.toFixed(2) : "";
    case "hireDate":
      return e.hireDate ? e.hireDate.toISOString().slice(0, 10) : "";
    case "frc":
      return e.frcNeeded == null ? "" : e.frcNeeded ? `Yes${e.frcSize ? ` (${e.frcSize})` : ""}` : "No";
    case "creditCard":
      return e.creditCardApproved == null ? "" : e.creditCardApproved ? "Yes" : "No";
    case "emailNeeded":
      return e.emailNeeded == null ? "" : e.emailNeeded ? "Yes" : "No";
    case "approved":
      return e.approved ? "Yes" : "No";
    default:
      return "";
  }
}

export async function attachGridExport(form: FormData): Promise<void> {
  const me = await requirePM();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const employeeIds = form.getAll("employeeIds").map(String);

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");
  if (employeeIds.length === 0) throw new Error("Select at least one employee to export.");

  const access = await getAccessMap(me.role);
  const cols = EXPORT_KEYS.filter((k) => canView(access, k));

  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, site: invoice.site },
    include: { certifications: { select: { name: true } } },
  });

  const header = cols.map((k) => csvField(COLUMNS.find((c) => c.key === k)?.label ?? k)).join(",");
  const lines = employees.map((e) => cols.map((k) => csvField(employeeFieldValue(e, k))).join(","));
  const csv = [header, ...lines].join("\r\n");

  const buffer = Buffer.from(csv, "utf-8");
  const fileName = `grid-export-${invoice.site.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
  const saved = await saveInvoiceFile(buffer, fileName, { invoiceId, category: "GRID_EXPORT" });

  await prisma.invoiceAttachment.create({
    data: {
      invoiceId,
      category: "GRID_EXPORT",
      fileName,
      storageKey: saved.storageKey,
      mimeType: "text/csv",
      size: saved.size,
    },
  });

  revalidatePath(`/admin/invoices/${invoiceId}`);
}
