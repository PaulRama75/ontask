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
