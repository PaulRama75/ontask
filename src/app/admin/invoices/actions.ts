"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getAccessMap, canView, getRestrictedSites, COLUMNS, COLUMN_KEYS } from "@/lib/rbac";
import { saveInvoiceFile, getFile } from "@/lib/storage";
import { sendEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Roles that create/edit invoices (Project Lead has the same invoice
// capabilities as Project Manager, scoped to their own invoices).
function isInvoiceCreatorRole(role: string): boolean {
  return role === "PROJECT_MANAGER" || role === "PROJECT_LEAD" || isAdminRole(role);
}

async function requirePM() {
  const me = await getCurrentUser();
  if (!me || !isInvoiceCreatorRole(me.role)) throw new Error("Not authorized");
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

// Same ownership rule used throughout this file: the PM/PL who created the
// invoice, or any admin (admins can manage every invoice, not just their own).
function isInvoiceOwner(me: { id: string; role: string }, invoice: { createdByUserId: string }) {
  return isAdminRole(me.role) || (isInvoiceCreatorRole(me.role) && invoice.createdByUserId === me.id);
}

// Mirrors the view-access rule on the invoice detail page: the owner, any
// PM/PL with Site Access to this invoice's site, or an AM once it's no
// longer a DRAFT.
async function canViewInvoice(
  me: { id: string; role: string },
  invoice: { site: string; status: string; createdByUserId: string },
): Promise<boolean> {
  if (isInvoiceOwner(me, invoice)) return true;
  const isPMorPL = me.role === "PROJECT_MANAGER" || me.role === "PROJECT_LEAD";
  if (isPMorPL) {
    const restrictedSites = await getRestrictedSites(me.id);
    if (!restrictedSites || restrictedSites.has(invoice.site)) return true;
  }
  if (me.role === "ACCOUNT_MANAGER" && invoice.status !== "DRAFT") return true;
  return false;
}

// Fallback client display name derived from their email when none is given,
// e.g. "billing@acme-corp.com" -> "Billing Acme Corp".
function deriveClientName(email: string): string {
  const local = email.split("@")[0] || email;
  const words = local.split(/[._\-+]+/).filter(Boolean);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return name || email;
}

// Admin-facing invoice notifications (final-approval alerts, "Email Admins")
// go to the one user designated via the Users page, or every active
// ADMIN/SUPER_ADMIN if nobody has been designated yet.
async function getInvoiceAdminRecipients() {
  const designated = await prisma.user.findMany({
    where: { receivesInvoiceAdminEmails: true, active: true },
  });
  if (designated.length > 0) return designated;
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
  });
}

// Escapes user-controlled text before interpolating into notification/invoice HTML emails.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type CreateInvoiceResult = { ok: false; error: string } | undefined;

export async function createInvoice(
  _prev: CreateInvoiceResult,
  form: FormData,
): Promise<CreateInvoiceResult> {
  const me = await requirePM();

  const site = String(form.get("site") ?? "").trim();
  const clientEmail = String(form.get("clientEmail") ?? "").trim().toLowerCase();
  const jobNumber = String(form.get("jobNumber") ?? "").trim() || null;
  const poNumber = String(form.get("poNumber") ?? "").trim() || null;

  if (!site) return { ok: false, error: "Site is required." };
  if (!clientEmail) return { ok: false, error: "Client email is required." };

  const client = await prisma.client.upsert({
    where: { email_site: { email: clientEmail, site } },
    update: {},
    create: { name: deriveClientName(clientEmail), email: clientEmail, site },
  });

  const invoice = await prisma.invoice.create({
    data: { clientId: client.id, site, jobNumber, poNumber, status: "DRAFT", createdByUserId: me.id },
  });

  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${invoice.id}`);
}

// Corrects the client's display name (e.g. an auto-derived name that came
// out wrong). Edits the shared Client record, so it applies to every
// invoice for that client/site, not just this one.
export async function updateClientName(form: FormData): Promise<void> {
  const me = await requirePM();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const name = String(form.get("clientName") ?? "").trim();
  if (!name) throw new Error("Client name is required.");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (!isInvoiceOwner(me, invoice)) throw new Error("Not authorized");

  await prisma.client.update({ where: { id: invoice.clientId }, data: { name } });
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath("/admin/invoices");
}

export async function addLineItem(form: FormData): Promise<void> {
  const me = await requirePM();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const amount = Number(form.get("amount") ?? "");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id && !isAdminRole(me.role)) throw new Error("Not authorized");
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
  if (lineItem.invoice.createdByUserId !== me.id && !isAdminRole(me.role))
    throw new Error("Not authorized");
  if (lineItem.invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");
  await prisma.invoiceLineItem.delete({ where: { id } });
  revalidatePath(`/admin/invoices/${lineItem.invoiceId}`);
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export async function uploadInvoiceAttachment(form: FormData): Promise<void> {
  const me = await requirePM();
  const invoiceId = String(form.get("invoiceId") ?? "");
  const category = String(form.get("category") ?? "OTHER");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id && !isAdminRole(me.role)) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`"${file.name}" exceeds the 15 MB limit.`);
  }
  if (file.type && !ALLOWED_ATTACHMENT_MIME.has(file.type)) {
    throw new Error(`"${file.name}" must be a PDF or image.`);
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
  if (att.invoice.createdByUserId !== me.id && !isAdminRole(me.role))
    throw new Error("Not authorized");
  if (att.invoice.status !== "DRAFT") throw new Error("Invoice is no longer editable.");
  await prisma.invoiceAttachment.delete({ where: { id } });
  revalidatePath(`/admin/invoices/${att.invoiceId}`);
}

const EXPORT_KEYS = COLUMN_KEYS.filter((k) => k !== "library");

function csvField(v: string): string {
  // Prefix a leading =, +, -, or @ with a tab to prevent CSV formula injection
  // when the file is opened in Excel/Google Sheets.
  const safe = /^[=+\-@]/.test(v) ? `\t${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
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
  employmentType: string | null;
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
    case "benefits":
      return e.employmentType == null
        ? ""
        : e.employmentType.split(",").map((s) => s.trim()).includes("Benefits")
          ? "Yes"
          : "No";
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
  if (invoice.createdByUserId !== me.id && !isAdminRole(me.role)) throw new Error("Not authorized");
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

export async function submitInvoice(form: FormData): Promise<void> {
  const me = await requirePM();
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id && !isAdminRole(me.role)) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT") throw new Error("Invoice already submitted.");
  if (invoice.lineItems.length === 0) throw new Error("Add at least one line item before submitting.");

  await prisma.invoice.update({ where: { id }, data: { status: "SUBMITTED" } });

  const ams = await prisma.user.findMany({ where: { role: "ACCOUNT_MANAGER", active: true } });
  for (const am of ams) {
    await sendEmail({
      to: am.email,
      subject: `Invoice ready for review — ${invoice.site}`,
      html: `<p>A new invoice for ${escapeHtml(invoice.site)} is ready for your review.</p>`,
    });
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function approveInvoice(form: FormData): Promise<void> {
  await requireAM();
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "SUBMITTED") throw new Error("Invoice must be submitted before it can be approved.");

  await prisma.invoice.update({ where: { id }, data: { status: "AM_APPROVED", rejectionReason: null } });

  const admins = await getInvoiceAdminRecipients();
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `Invoice ready for final approval — ${invoice.site}`,
      html: `<p>An invoice for ${escapeHtml(invoice.site)} was approved by the Account Manager and is ready for your final sign-off.</p>`,
    });
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function rejectInvoice(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const id = String(form.get("invoiceId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) throw new Error("A rejection reason is required.");

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");

  const isAM = me.role === "ACCOUNT_MANAGER";
  const admin = isAdminRole(me.role);
  const canRejectSubmitted = invoice.status === "SUBMITTED" && (isAM || admin);
  const canRejectAmApproved = invoice.status === "AM_APPROVED" && admin;
  if (!canRejectSubmitted && !canRejectAmApproved) {
    throw new Error("Not authorized to reject this invoice at its current status.");
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: "DRAFT", rejectionReason: reason, rejectedByUserId: me.id },
  });

  const creator = await prisma.user.findUnique({ where: { id: invoice.createdByUserId } });
  if (creator) {
    await sendEmail({
      to: creator.email,
      subject: `Invoice rejected — ${invoice.site}`,
      html: `<p>Your invoice for ${escapeHtml(invoice.site)} was rejected.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p>Please review and resubmit.</p>`,
    });
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

// Admin's final approval, separate from actually sending the invoice.
// Notifies Account Managers that it's approved and about to go out.
export async function approveInvoiceFinal(form: FormData): Promise<void> {
  await requireAdminUser();
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "AM_APPROVED") {
    throw new Error("Invoice must be Account-Manager approved before it can be approved.");
  }

  await prisma.invoice.update({ where: { id }, data: { status: "ADMIN_APPROVED" } });

  const ams = await prisma.user.findMany({ where: { role: "ACCOUNT_MANAGER", active: true } });
  for (const am of ams) {
    await sendEmail({
      to: am.email,
      subject: `Invoice approved — ${invoice.site}`,
      html: `<p>The invoice for ${escapeHtml(invoice.site)} has been approved and will be sent to the client.</p>`,
    });
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

// Sends the approved invoice to the client. Available directly from
// AM_APPROVED (skipping a separate approve step) or from ADMIN_APPROVED
// after the admin already approved it -- either way it counts as approval.
export async function sendInvoiceToClient(form: FormData): Promise<void> {
  await requireAdminUser();
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, lineItems: true, attachments: true },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "AM_APPROVED" && invoice.status !== "ADMIN_APPROVED") {
    throw new Error("Invoice must be Account-Manager approved before it can be sent.");
  }

  if (invoice.status === "AM_APPROVED") {
    await prisma.invoice.update({ where: { id }, data: { status: "ADMIN_APPROVED" } });
  }

  const total = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const rows = invoice.lineItems
    .map(
      (li) =>
        `<tr><td>${escapeHtml(li.description)}</td><td style="text-align:right">$${li.amount.toFixed(2)}</td></tr>`,
    )
    .join("");
  const html = `<p>Hello ${escapeHtml(invoice.client.name)},</p>
<p>Please find your invoice for ${escapeHtml(invoice.site)} below.</p>
<table cellpadding="6" style="border-collapse:collapse;width:100%">
${rows}
<tr><td style="font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">$${total.toFixed(2)}</td></tr>
</table>
<p>Supporting documents are attached.</p>`;

  const attachments: { filename: string; content: string }[] = [];
  for (const att of invoice.attachments) {
    const file = await getFile(att.storageKey);
    if (file) attachments.push({ filename: att.fileName, content: file.buffer.toString("base64") });
  }

  const sent = await sendEmail({
    to: invoice.client.email,
    subject: `Invoice — ${invoice.site}`,
    html,
    attachments,
  });

  if (sent) {
    await prisma.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });

    const ams = await prisma.user.findMany({ where: { role: "ACCOUNT_MANAGER", active: true } });
    for (const am of ams) {
      await sendEmail({
        to: am.email,
        subject: `Invoice sent to client — ${invoice.site}`,
        html: `<p>The invoice for ${escapeHtml(invoice.site)} has been sent to the client.</p>`,
      });
    }
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");

  if (!sent) {
    throw new Error("Email to the client failed to send. Click Send again to retry.");
  }
}

// Manually re-sends the same notification that fires automatically on
// submit/approve, for nudging the next reviewer without changing status.
export async function notifyNextRole(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");

  if (invoice.status === "SUBMITTED") {
    if (!isInvoiceOwner(me, invoice)) throw new Error("Not authorized");
    const ams = await prisma.user.findMany({ where: { role: "ACCOUNT_MANAGER", active: true } });
    for (const am of ams) {
      await sendEmail({
        to: am.email,
        subject: `Reminder: invoice ready for review — ${invoice.site}`,
        html: `<p>Reminder: an invoice for ${escapeHtml(invoice.site)} is still waiting for your review.</p>`,
      });
    }
  } else if (invoice.status === "AM_APPROVED") {
    if (me.role !== "ACCOUNT_MANAGER" && !isAdminRole(me.role)) throw new Error("Not authorized");
    const admins = await getInvoiceAdminRecipients();
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `Reminder: invoice ready for final approval — ${invoice.site}`,
        html: `<p>Reminder: an invoice for ${escapeHtml(invoice.site)} is still waiting for your final sign-off.</p>`,
      });
    }
  } else {
    throw new Error("No next reviewer to notify at this invoice's current status.");
  }
}

export async function archiveInvoice(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");
  if (!isInvoiceOwner(me, invoice)) throw new Error("Not authorized");

  await prisma.invoice.update({ where: { id }, data: { archived: true } });
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function unarchiveInvoice(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");
  if (!isInvoiceOwner(me, invoice)) throw new Error("Not authorized");

  await prisma.invoice.update({ where: { id }, data: { archived: false } });
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function addInvoiceComment(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const invoiceId = String(form.get("invoiceId") ?? "");
  const message = String(form.get("message") ?? "").trim();
  if (!message) throw new Error("A comment is required.");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  if (!(await canViewInvoice(me, invoice))) throw new Error("Not authorized");

  await prisma.invoiceComment.create({
    data: {
      invoiceId,
      authorUserId: me.id,
      authorName: me.name || me.email,
      message,
    },
  });

  revalidatePath(`/admin/invoices/${invoiceId}`);
}

// Lets the invoice owner send a one-off email reply to whoever rejected it
// (the "last person" who acted on it) — a quick "fixed, see updated
// timesheet" note rather than a full comment thread.
export async function replyToRejection(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  const id = String(form.get("invoiceId") ?? "");
  const message = String(form.get("message") ?? "").trim();
  if (!message) throw new Error("A reply message is required.");

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");
  if (!isInvoiceOwner(me, invoice)) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT" || !invoice.rejectionReason || !invoice.rejectedByUserId) {
    throw new Error("This invoice hasn't been rejected.");
  }

  const rejector = await prisma.user.findUnique({ where: { id: invoice.rejectedByUserId } });
  if (rejector) {
    const from = me.name || me.email;
    await sendEmail({
      to: rejector.email,
      subject: `Reply — invoice for ${invoice.site}`,
      html: `<p>${escapeHtml(from)} replied about the invoice for ${escapeHtml(invoice.site)} you rejected:</p><p>${escapeHtml(message)}</p>`,
    });
  }
}
