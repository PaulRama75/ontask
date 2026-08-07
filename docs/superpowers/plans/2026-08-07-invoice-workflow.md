# Invoice Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Project Manager build an invoice for a client/site, route it through Account Manager and Admin approval, and have the system email it (with attachments) to the client.

**Architecture:** New `PROJECT_MANAGER` role plus four new Prisma models (`Client`, `Invoice`, `InvoiceLineItem`, `InvoiceAttachment`) kept entirely separate from the existing `Employee`/`Document` tables. Server actions in a single `src/app/admin/invoices/actions.ts` enforce role + status checks (mirroring the existing `requireAdmin()`/`requireColumn()` pattern), reuse the existing storage adapter (new `saveInvoiceFile()`) and email layer (`sendEmail()`, extended to report success/failure and carry attachments). Routes live under `/admin/invoices/*` so they inherit the existing `admin/layout.tsx` header/nav for free.

**Tech Stack:** Next.js 16.2.7 (App Router, Server Actions) + React 19.2.4 + Prisma 6.19.3 + SQLite (dev) + Tailwind. No test framework is installed in this repo and none is being added — this codebase's own convention (see `docs/superpowers/specs/2026-08-07-invoice-workflow-design.md` and every existing feature in `src/app/admin`) is manual browser verification plus `npx tsc --noEmit` / `npm run build` as the correctness gate. Each task below follows that same pattern instead of red/green unit tests.

> Per `AGENTS.md` in this repo: this Next.js version has API differences from training-data Next.js. Every code sample below is copied from or directly modeled on real, working files already in this codebase (`src/lib/auth.ts`, `src/app/admin/actions.ts`, `src/app/admin/grid/page.tsx`, `src/app/login/*`, etc.) rather than from memory — follow the samples exactly rather than "fixing" them to match older Next conventions.

---

### Task 1: Add the `PROJECT_MANAGER` role

**Files:**
- Modify: `src/lib/rbac.ts:4-26`

- [ ] **Step 1: Add the role to `ROLES` and `ROLE_LABELS`**

In `src/lib/rbac.ts`, change:

```ts
export const ROLES = [
  "EMPLOYEE",
  "TRACKS",
  "HR",
  "ACCOUNT_MANAGER",
  "PROJECT_LEAD",
  "SAFETY",
  "ADMIN",
  "SUPER_ADMIN",
] as const;
```

to:

```ts
export const ROLES = [
  "EMPLOYEE",
  "TRACKS",
  "HR",
  "ACCOUNT_MANAGER",
  "PROJECT_LEAD",
  "PROJECT_MANAGER",
  "SAFETY",
  "ADMIN",
  "SUPER_ADMIN",
] as const;
```

and change:

```ts
export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  TRACKS: "Tracks",
  HR: "HR",
  ACCOUNT_MANAGER: "Account Manager",
  PROJECT_LEAD: "Project Lead",
  SAFETY: "Safety",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};
```

to:

```ts
export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  TRACKS: "Tracks",
  HR: "HR",
  ACCOUNT_MANAGER: "Account Manager",
  PROJECT_LEAD: "Project Lead",
  PROJECT_MANAGER: "Project Manager",
  SAFETY: "Safety",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};
```

Do not touch `defaultAccess()` — `PROJECT_MANAGER` falls through to the `default:` branch there (same as `EMPLOYEE` today, i.e. hidden from the employee grid's `ColumnAccess` system), which is correct: invoice permissions are checked by role directly, not via `ColumnAccess`.

- [ ] **Step 2: Type-check**

Run: `cd C:\Users\pallo\Downloads\fer-onboarding && npx tsc --noEmit`
Expected: no errors (adding a union member is backward compatible everywhere `Role` is used).

- [ ] **Step 3: Commit**

```bash
git add src/lib/rbac.ts
git commit -m "Add PROJECT_MANAGER role"
```

---

### Task 2: Invoice data model + migration

**Files:**
- Modify: `prisma/schema.prisma` (append at end of file)

- [ ] **Step 1: Append the new models**

Add this block to the end of `prisma/schema.prisma`:

```prisma
// A billing client for a site/project. Invoices are sent to Client.email.
model Client {
  id        String    @id @default(cuid())
  name      String
  email     String
  site      String
  createdAt DateTime  @default(now())
  invoices  Invoice[]
}

// An invoice built by a Project Manager, reviewed by an Account Manager, and
// given final sign-off (which triggers the client email) by an Admin.
// status: DRAFT | SUBMITTED | AM_APPROVED | ADMIN_APPROVED | SENT
model Invoice {
  id              String    @id @default(cuid())
  clientId        String
  client          Client    @relation(fields: [clientId], references: [id])
  site            String
  status          String    @default("DRAFT")
  createdByUserId String
  rejectionReason String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  sentAt          DateTime?

  lineItems   InvoiceLineItem[]
  attachments InvoiceAttachment[]
}

// Free-form invoice line (description + amount), entered by the Project Manager.
model InvoiceLineItem {
  id          String   @id @default(cuid())
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId   String
  description String
  amount      Float
  createdAt   DateTime @default(now())
}

// Files attached to an invoice (uploaded timesheets, generated grid exports, etc).
// category: TIMESHEET | GRID_EXPORT | OTHER
model InvoiceAttachment {
  id         String   @id @default(cuid())
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId  String
  category   String
  fileName   String
  storageKey String
  mimeType   String
  size       Int
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd C:\Users\pallo\Downloads\fer-onboarding && npx prisma migrate dev --name add_invoice_models`
Expected: output ending in `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` (timestamp prefix + `add_invoice_models`) containing `migration.sql`. This also regenerates the Prisma client, so `prisma.client`, `prisma.invoice`, `prisma.invoiceLineItem`, `prisma.invoiceAttachment` become available and typed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add Client/Invoice/InvoiceLineItem/InvoiceAttachment models"
```

---

### Task 3: Storage — invoice attachment key convention

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Add `saveInvoiceFile()`**

In `src/lib/storage.ts`, add this function after the existing `saveFile()` (before `getFile()`). It mirrors `saveFile()`'s LOCAL-driver write logic exactly, but keys files under `invoices/<invoiceId>/...` instead of `library/<employee>/...` — `getFile()` already takes an arbitrary key so it's reused as-is for invoice attachments, no change needed there.

```ts
// Organizes invoice attachments as:
//   invoices/<invoiceId>/<CATEGORY>-<unique>-<original-filename>
export async function saveInvoiceFile(
  buffer: Buffer,
  originalName: string,
  opts: { invoiceId: string; category: string },
): Promise<SavedFile> {
  const ext = path.extname(originalName);
  const baseName = slug(path.basename(originalName, ext), "file") + ext;
  const category = slug(opts.category, "OTHER");
  const unique = randomUUID().slice(0, 8);
  const key = `invoices/${opts.invoiceId}/${category}-${unique}-${baseName}`;

  if (DRIVER === "LOCAL") {
    const dest = localPathFor(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return { storageKey: key, size: buffer.length };
  }

  throw new Error(`Storage driver "${DRIVER}" not implemented yet`);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Functional verification of the write path happens in Task 8, when it's wired to a real upload form.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "Add saveInvoiceFile for invoice attachment storage"
```

---

### Task 4: Email — report success/failure, support attachments

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Extend `sendEmail`**

Replace the full contents of `src/lib/email.ts` with:

```ts
// Pluggable email layer. Phase 1: console stub unless RESEND_API_KEY is set.
// Phase 3 wires real HR / Project Lead notification triggers.

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[]; // content = base64
};

// Returns true if the email was sent (or stubbed in dev), false if a real send failed.
export async function sendEmail({ to, subject, html, attachments }: SendArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@fer.local";

  if (!key) {
    console.log("[email:stub] would send ->", {
      to,
      from,
      subject,
      attachmentCount: attachments?.length ?? 0,
    });
    return true;
  }

  // Resend HTTP API (no SDK dependency needed).
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, ...(attachments ? { attachments } : {}) }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] send failed", res.status, body);
    return false;
  }
  return true;
}
```

This is backward compatible: the existing call site in `src/app/admin/actions.ts` (`createOnboardingLink`) calls `await sendEmail({ to, subject, html })` and ignores the return value — that keeps working unchanged since `attachments` is optional and a discarded return value is always valid.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "sendEmail: report success/failure, support attachments"
```

---

### Task 5: Invoice creation — action + page

**Files:**
- Create: `src/app/admin/invoices/actions.ts`
- Create: `src/app/admin/invoices/new/page.tsx`
- Create: `src/app/admin/invoices/new/NewInvoiceForm.tsx`

- [ ] **Step 1: Create the actions file with role-check helpers and `createInvoice`**

Create `src/app/admin/invoices/actions.ts`:

```ts
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
```

(Later tasks append more exports to this same file — `addLineItem`/`deleteLineItem` in Task 6, `uploadInvoiceAttachment`/`deleteInvoiceAttachment` in Task 7, `attachGridExport` in Task 8, `submitInvoice`/`approveInvoice`/`rejectInvoice`/`approveAndSend` in Task 9. The unused imports above (`getAccessMap`, `canView`, `COLUMNS`, `COLUMN_KEYS`, `saveInvoiceFile`, `getFile`, `sendEmail`) are intentional — they're consumed by those later additions to this file, so leave them in place now.)

- [ ] **Step 2: Create the server page that guards access**

Create `src/app/admin/invoices/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import NewInvoiceForm from "./NewInvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "PROJECT_MANAGER") redirect("/admin/invoices");

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-lg px-4">
        <h1 className="text-2xl font-bold text-gray-900">New invoice</h1>
        <NewInvoiceForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the client form**

Create `src/app/admin/invoices/new/NewInvoiceForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createInvoice, type CreateInvoiceResult } from "../actions";

export default function NewInvoiceForm() {
  const [state, formAction, pending] = useActionState<CreateInvoiceResult, FormData>(
    createInvoice,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">Site</label>
        <input
          name="site"
          required
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Client name</label>
        <input
          name="clientName"
          required
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Client email</label>
        <input
          name="clientEmail"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {state?.ok === false && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/invoices/actions.ts src/app/admin/invoices/new
git commit -m "Add invoice creation action and new-invoice page"
```

---

### Task 6: Invoices list page + line items on the detail page

**Files:**
- Create: `src/app/admin/invoices/page.tsx`
- Create: `src/app/admin/invoices/[id]/page.tsx`
- Modify: `src/app/admin/invoices/actions.ts` (append `addLineItem`, `deleteLineItem`)

- [ ] **Step 1: Append line-item actions**

Add to the end of `src/app/admin/invoices/actions.ts`:

```ts
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
```

- [ ] **Step 2: Create the list page**

Create `src/app/admin/invoices/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AM_APPROVED: "AM Approved",
  ADMIN_APPROVED: "Admin Approved",
  SENT: "Sent",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-amber-100 text-amber-700",
  AM_APPROVED: "bg-blue-100 text-blue-700",
  ADMIN_APPROVED: "bg-blue-100 text-blue-700",
  SENT: "bg-green-100 text-green-700",
};

export default async function InvoicesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowedRoles = ["PROJECT_MANAGER", "ACCOUNT_MANAGER", "ADMIN", "SUPER_ADMIN"];
  if (!allowedRoles.includes(me.role)) redirect("/admin/grid");

  let restrictedSites: Set<string> | null = null;
  if (!isAdminRole(me.role)) {
    const mine = await prisma.userSite.findMany({
      where: { userId: me.id },
      select: { site: true },
    });
    if (mine.length > 0) restrictedSites = new Set(mine.map((s) => s.site));
  }

  const where =
    me.role === "PROJECT_MANAGER"
      ? { createdByUserId: me.id }
      : me.role === "ACCOUNT_MANAGER"
        ? { status: { not: "DRAFT" } }
        : {};

  const all = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { client: true, lineItems: true },
  });

  const invoices = restrictedSites ? all.filter((inv) => restrictedSites!.has(inv.site)) : all;

  const th =
    "border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600";
  const td = "border border-gray-300 px-3 py-2 align-top text-gray-800";

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500">
              {me.role === "PROJECT_MANAGER"
                ? "Invoices you've created."
                : "Invoices awaiting or past your review."}
            </p>
          </div>
          {me.role === "PROJECT_MANAGER" && (
            <Link
              href="/admin/invoices/new"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + New invoice
            </Link>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Site</th>
                <th className={th}>Client</th>
                <th className={th}>Total</th>
                <th className={th}>Status</th>
                <th className={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-400`} colSpan={5}>
                    No invoices yet.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const total = inv.lineItems.reduce((sum, li) => sum + li.amount, 0);
                return (
                  <tr key={inv.id}>
                    <td className={td}>
                      <Link href={`/admin/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                        {inv.site}
                      </Link>
                    </td>
                    <td className={td}>{inv.client.name}</td>
                    <td className={td}>${total.toFixed(2)}</td>
                    <td className={td}>
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_STYLE[inv.status]}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{inv.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the detail page with the line items section**

Create `src/app/admin/invoices/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { addLineItem, deleteLineItem } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AM_APPROVED: "AM Approved",
  ADMIN_APPROVED: "Admin Approved (sending)",
  SENT: "Sent",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      lineItems: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) notFound();

  const isOwnerPM = me.role === "PROJECT_MANAGER" && invoice.createdByUserId === me.id;
  const isAM = me.role === "ACCOUNT_MANAGER";
  const isAdmin = isAdminRole(me.role);
  if (!isOwnerPM && !isAM && !isAdmin) redirect("/admin/invoices");

  const isDraftEditable = invoice.status === "DRAFT" && isOwnerPM;
  const total = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);

  const th = "px-2 py-1 text-left text-xs font-semibold uppercase text-gray-500";
  const td = "px-2 py-1.5 text-gray-800";

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.site}</h1>
            <p className="text-sm text-gray-500">
              {invoice.client.name} · {invoice.client.email}
            </p>
          </div>
          <Link href="/admin/invoices" className="text-sm text-blue-600 hover:underline">
            ← All invoices
          </Link>
        </div>

        <span className="inline-block rounded-md bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
          {STATUS_LABEL[invoice.status] ?? invoice.status}
        </span>

        {invoice.rejectionReason && invoice.status === "DRAFT" && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <strong>Rejected:</strong> {invoice.rejectionReason}
          </p>
        )}

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Line items</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Description</th>
                <th className={th}>Amount</th>
                {isDraftEditable && <th className={th}></th>}
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id} className="border-t border-gray-100">
                  <td className={td}>{li.description}</td>
                  <td className={td}>${li.amount.toFixed(2)}</td>
                  {isDraftEditable && (
                    <td className={td}>
                      <form action={deleteLineItem}>
                        <input type="hidden" name="lineItemId" value={li.id} />
                        <button className="text-xs text-red-600 hover:underline">Remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-semibold">
                <td className={td}>Total</td>
                <td className={td}>${total.toFixed(2)}</td>
                {isDraftEditable && <td className={td}></td>}
              </tr>
            </tbody>
          </table>

          {isDraftEditable && (
            <form action={addLineItem} className="mt-4 flex gap-2">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input
                name="description"
                placeholder="Description"
                required
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                required
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
              >
                Add
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
```

(Task 7 adds an Attachments section and Task 9 adds an Actions section to this same file — both inserted as new `<section>` blocks after the Line items section, inside the existing `<div className="mx-auto max-w-3xl px-4">` wrapper.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (or use the existing `fer-onboarding` launch config), then in the browser:
1. Log in as `admin@fer.local` / `changeme123`, go to `/admin/users`, create a user with role `Project Manager` (e.g. `pm@fer.local` / `pmpass123`) if one doesn't already exist.
2. Log out, log in as that PM.
3. Visit `/admin/invoices` → should see "No invoices yet." and a "+ New invoice" button.
4. Click it, fill Site/Client name/Client email, submit → should redirect to `/admin/invoices/<id>` showing status "Draft".
5. Add two line items → both appear in the table with a correct running total.
6. Remove one → it disappears and the total updates.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/invoices/actions.ts src/app/admin/invoices/page.tsx "src/app/admin/invoices/[id]/page.tsx"
git commit -m "Add invoices list page and line items on the detail page"
```

---

### Task 7: Attachments + authed file-serving route

**Files:**
- Modify: `src/app/admin/invoices/actions.ts` (append `uploadInvoiceAttachment`, `deleteInvoiceAttachment`)
- Modify: `src/app/admin/invoices/[id]/page.tsx` (add Attachments section)
- Create: `src/app/api/invoice-files/[id]/route.ts`

- [ ] **Step 1: Append attachment actions**

Add to the end of `src/app/admin/invoices/actions.ts`:

```ts
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
```

- [ ] **Step 2: Create the authed file-serving route**

Create `src/app/api/invoice-files/[id]/route.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";

// Serves an invoice attachment. Unlike /api/files/[id] (employee documents,
// currently unauthenticated), this route checks the caller's role/ownership
// since invoice attachments (timesheets, client info) are more sensitive.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = await prisma.invoiceAttachment.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!att) return new Response("Not found", { status: 404 });

  const allowed =
    isAdminRole(me.role) || me.role === "ACCOUNT_MANAGER" || att.invoice.createdByUserId === me.id;
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const file = await getFile(att.storageKey);
  if (!file) return new Response("File missing", { status: 404 });

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.fileName)}"`,
    },
  });
}
```

- [ ] **Step 3: Add the Attachments section to the detail page**

In `src/app/admin/invoices/[id]/page.tsx`, add `uploadInvoiceAttachment, deleteInvoiceAttachment` to the import from `"../actions"` (so the line reads `import { addLineItem, deleteLineItem, uploadInvoiceAttachment, deleteInvoiceAttachment } from "../actions";`), then insert this new `<section>` immediately after the closing `</section>` of the Line items section (i.e. right before the final `</div>\n    </main>`):

```tsx
        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {invoice.attachments.length === 0 && <li className="text-gray-400">No attachments yet.</li>}
            {invoice.attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between">
                <a
                  href={`/api/invoice-files/${att.id}`}
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  {att.fileName} <span className="text-xs text-gray-400">({att.category})</span>
                </a>
                {isDraftEditable && (
                  <form action={deleteInvoiceAttachment}>
                    <input type="hidden" name="attachmentId" value={att.id} />
                    <button className="text-xs text-red-600 hover:underline">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {isDraftEditable && (
            <form action={uploadInvoiceAttachment} className="mt-4 flex items-center gap-2">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <select name="category" className="rounded-md border border-gray-300 px-2 py-2 text-sm">
                <option value="TIMESHEET">Timesheet</option>
                <option value="OTHER">Other</option>
              </select>
              <input type="file" name="file" required className="text-sm" />
              <button
                type="submit"
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
              >
                Upload
              </button>
            </form>
          )}
        </section>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With `npm run dev` running, on an existing DRAFT invoice: upload a small PDF or image as category "Timesheet" → it appears in the Attachments list; click it → opens/downloads correctly with the right filename. Confirm `storage/invoices/<invoiceId>/TIMESHEET-...` exists on disk. Log in as a different, unrelated Project Manager and hit `/api/invoice-files/<that-attachment-id>` directly → expect `403 Forbidden`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/invoices/actions.ts "src/app/admin/invoices/[id]/page.tsx" src/app/api/invoice-files
git commit -m "Add invoice attachment upload and authed file serving"
```

---

### Task 8: Grid export attachment

**Files:**
- Modify: `src/app/admin/invoices/actions.ts` (append `attachGridExport`)
- Modify: `src/app/admin/invoices/[id]/page.tsx` (add grid-export form)

- [ ] **Step 1: Append the grid-export action**

Add to the end of `src/app/admin/invoices/actions.ts`:

```ts
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
```

- [ ] **Step 2: Add the grid-export form to the detail page**

In `src/app/admin/invoices/[id]/page.tsx`:

1. Add `attachGridExport` to the `"../actions"` import.
2. After loading `invoice` and computing `isDraftEditable`, add a query for the invoice's site employees (only needed when the form will actually render):

```tsx
  let siteEmployees: { id: string; firstName: string | null; lastName: string | null }[] = [];
  if (isDraftEditable) {
    siteEmployees = await prisma.employee.findMany({
      where: { site: invoice.site },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    });
  }
```

Place this right after the `const total = ...` line.

3. Inside the Attachments `<section>` (added in Task 7), append this block right before the section's closing `</section>` tag (after the upload `<form>`):

```tsx
          {isDraftEditable && siteEmployees.length > 0 && (
            <form action={attachGridExport} className="mt-6 border-t border-gray-100 pt-4">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <p className="text-sm font-medium text-gray-700">Attach a grid snapshot for {invoice.site}</p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                {siteEmployees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="employeeIds" value={e.id} defaultChecked />
                    {[e.firstName, e.lastName].filter(Boolean).join(" ") || "(unnamed)"}
                  </label>
                ))}
              </div>
              <button
                type="submit"
                className="mt-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Attach grid snapshot
              </button>
            </form>
          )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Create an employee via `/admin` onboarding with `site` matching your test invoice's site (or reuse an existing one — set its `site` field on the grid to match). On the invoice detail page, check the employee(s), click "Attach grid snapshot" → a new `GRID_EXPORT` attachment appears; open it and confirm it's a valid CSV with a header row and the expected columns/values.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/invoices/actions.ts "src/app/admin/invoices/[id]/page.tsx"
git commit -m "Add grid-export attachment generation"
```

---

### Task 9: Status transitions — submit, approve, reject, approve & send

**Files:**
- Modify: `src/app/admin/invoices/actions.ts` (append `submitInvoice`, `approveInvoice`, `rejectInvoice`, `approveAndSend`)
- Modify: `src/app/admin/invoices/[id]/page.tsx` (add Actions section)

- [ ] **Step 1: Append the status-transition actions**

Add to the end of `src/app/admin/invoices/actions.ts`:

```ts
export async function submitInvoice(form: FormData): Promise<void> {
  const me = await requirePM();
  const id = String(form.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.createdByUserId !== me.id) throw new Error("Not authorized");
  if (invoice.status !== "DRAFT") throw new Error("Invoice already submitted.");
  if (invoice.lineItems.length === 0) throw new Error("Add at least one line item before submitting.");

  await prisma.invoice.update({ where: { id }, data: { status: "SUBMITTED" } });

  const ams = await prisma.user.findMany({ where: { role: "ACCOUNT_MANAGER", active: true } });
  for (const am of ams) {
    await sendEmail({
      to: am.email,
      subject: `Invoice ready for review — ${invoice.site}`,
      html: `<p>A new invoice for ${invoice.site} is ready for your review.</p>`,
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

  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
  });
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `Invoice ready for final approval — ${invoice.site}`,
      html: `<p>An invoice for ${invoice.site} was approved by the Account Manager and is ready for your final sign-off.</p>`,
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

  await prisma.invoice.update({ where: { id }, data: { status: "DRAFT", rejectionReason: reason } });

  const creator = await prisma.user.findUnique({ where: { id: invoice.createdByUserId } });
  if (creator) {
    await sendEmail({
      to: creator.email,
      subject: `Invoice rejected — ${invoice.site}`,
      html: `<p>Your invoice for ${invoice.site} was rejected.</p><p><strong>Reason:</strong> ${reason}</p><p>Please review and resubmit.</p>`,
    });
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function approveAndSend(form: FormData): Promise<void> {
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
        `<tr><td>${li.description}</td><td style="text-align:right">$${li.amount.toFixed(2)}</td></tr>`,
    )
    .join("");
  const html = `<p>Hello ${invoice.client.name},</p>
<p>Please find your invoice for ${invoice.site} below.</p>
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
  }

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");

  if (!sent) {
    throw new Error("Email to the client failed to send. The invoice is approved — click Send again to retry.");
  }
}
```

- [ ] **Step 2: Add the Actions section to the detail page**

In `src/app/admin/invoices/[id]/page.tsx`:

1. Add `submitInvoice, approveInvoice, rejectInvoice, approveAndSend` to the `"../actions"` import.
2. Insert this new `<section>` right before the final `</div>\n    </main>` (after the Attachments section):

```tsx
        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {isDraftEditable && (
              <form action={submitInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Submit for review
                </button>
              </form>
            )}

            {isAM && invoice.status === "SUBMITTED" && (
              <form action={approveInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Approve
                </button>
              </form>
            )}

            {isAdmin && (invoice.status === "AM_APPROVED" || invoice.status === "ADMIN_APPROVED") && (
              <form action={approveAndSend}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  {invoice.status === "ADMIN_APPROVED" ? "Retry send to client" : "Approve & send to client"}
                </button>
              </form>
            )}

            {((isAM && invoice.status === "SUBMITTED") ||
              (isAdmin && (invoice.status === "SUBMITTED" || invoice.status === "AM_APPROVED"))) && (
              <form action={rejectInvoice} className="flex items-center gap-2">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input
                  name="reason"
                  placeholder="Rejection reason"
                  required
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Reject
                </button>
              </form>
            )}
          </div>
        </section>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Type consistency check**

Re-read the full `src/app/admin/invoices/actions.ts` and confirm every status string used (`"DRAFT"`, `"SUBMITTED"`, `"AM_APPROVED"`, `"ADMIN_APPROVED"`, `"SENT"`) is spelled identically everywhere across Tasks 5–9 and matches the `@default("DRAFT")` in the Task 2 schema. Confirm every function this task's page imports (`submitInvoice`, `approveInvoice`, `rejectInvoice`, `approveAndSend`) is actually exported with that exact name from `actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/invoices/actions.ts "src/app/admin/invoices/[id]/page.tsx"
git commit -m "Add invoice status transitions: submit, approve, reject, send"
```

---

### Task 10: Nav link + seed test accounts

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Modify: `scripts/seed.cjs`

- [ ] **Step 1: Add the Invoices nav link**

In `src/app/admin/layout.tsx`, inside the `<nav>`, right after the `<Link href="/admin" ...>Onboarding</Link>` line and before the `{admin && (...)}` block, add:

```tsx
            {["PROJECT_MANAGER", "ACCOUNT_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role) && (
              <Link href="/admin/invoices" className="text-gray-600 hover:text-gray-900">
                Invoices
              </Link>
            )}
```

- [ ] **Step 2: Extend the seed script**

Replace the full contents of `scripts/seed.cjs` with:

```js
// Seeds dev login accounts. Run: node scripts/seed.cjs
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${dk}`;
}

async function ensureUser({ email, password, role, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`${role} already exists: ${email}`);
    return;
  }
  await prisma.user.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
  console.log(`Created ${role}: ${email} / ${password}`);
}

async function main() {
  await ensureUser({
    email: process.env.SEED_ADMIN_EMAIL || "admin@fer.local",
    password: process.env.SEED_ADMIN_PASSWORD || "changeme123",
    role: "SUPER_ADMIN",
    name: "Super Admin",
  });
  await ensureUser({
    email: process.env.SEED_PM_EMAIL || "pm@fer.local",
    password: process.env.SEED_PM_PASSWORD || "pmpass123",
    role: "PROJECT_MANAGER",
    name: "Project Manager",
  });
  await ensureUser({
    email: process.env.SEED_AM_EMAIL || "am@fer.local",
    password: process.env.SEED_AM_PASSWORD || "ampass123",
    role: "ACCOUNT_MANAGER",
    name: "Account Manager",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

This preserves the existing `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env var behavior exactly and adds two new idempotent accounts.

- [ ] **Step 3: Run the seed script**

Run: `cd C:\Users\pallo\Downloads\fer-onboarding && node scripts/seed.cjs`
Expected: prints either "Created ..." or "... already exists" for all three accounts, no errors.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`seed.cjs` is plain JS, not part of the TS project, so this only re-checks the layout change.)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/layout.tsx scripts/seed.cjs
git commit -m "Add Invoices nav link and seed PM/AM test accounts"
```

---

### Task 11: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full build check**

Run: `cd C:\Users\pallo\Downloads\fer-onboarding && npm run build`
Expected: build succeeds with no type or compile errors.

- [ ] **Step 2: Happy path — DRAFT → SENT**

With `npm run dev` running and `RESEND_API_KEY` left blank (stub mode, so sent email is logged to the server console instead of actually delivered):

1. Log in as `pm@fer.local`. Create a new invoice (site `"Test Site"`, any client name/email). Add two line items. Upload one attachment. Attach a grid snapshot if any employees exist at `"Test Site"` (create one via `/admin` onboarding first if not). Click "Submit for review".
2. Log out, log in as `am@fer.local`. Go to `/admin/invoices`, open the invoice (status "Submitted"), click "Approve". Confirm the server console logs a stub email to `admin@fer.local`.
3. Log out, log in as `admin@fer.local`. Open the invoice (status "AM Approved"), click "Approve & send to client". Confirm the server console logs a stub email to the client's address, listing the line items and the attachment as a base64 payload, and the page now shows status "Sent".
4. Confirm `/admin/invoices` for the PM and the AM both show the invoice as "Sent".

- [ ] **Step 3: Rejection loop**

1. As `pm@fer.local`, create a second invoice, add one line item, submit it.
2. As `am@fer.local`, open it and reject it with a reason (e.g. "Missing timesheet").
3. Log back in as `pm@fer.local`, confirm the invoice shows status "Draft" again with the rejection reason banner visible, and that line items/attachments are still editable.
4. Add the missing item, resubmit, and confirm it reaches `am@fer.local`'s queue again.

- [ ] **Step 4: Access control spot-check**

As a second `PROJECT_MANAGER` test user (create one via `/admin/users` if needed), confirm `/admin/invoices/<first-PM's-invoice-id>` redirects away rather than showing the invoice. As `HR` or `TRACKS`, confirm no "Invoices" link appears in the nav and `/admin/invoices` redirects to `/admin/grid`.

- [ ] **Step 5: Final commit**

If Step 1–4 required any fixes, commit them:

```bash
git add -A
git commit -m "Fix issues found during invoice workflow end-to-end verification"
```

(Skip this commit if no fixes were needed.)

---

## Post-plan note

Per the design spec's explicit non-goals: this plan does not touch `Employee`/`Document`, does not calculate line items from pay/bill rates, and does not generate a PDF. Those are deferred until the user asks to integrate this feature with the rest of the app.
