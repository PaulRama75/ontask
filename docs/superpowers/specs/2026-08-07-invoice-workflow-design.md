# Invoice Approval Workflow — Design Spec

Date: 2026-08-07
Status: Approved for planning

## Purpose

Add an invoicing feature to the FER onboarding app: a Project Manager builds an
invoice for a client/site, an Account Manager reviews it, an Admin gives final
sign-off, and the system emails the completed invoice (with attachments) to
the client. Replaces an ad-hoc/manual invoice process with a tracked,
role-gated workflow inside the existing app.

## Scope

In scope:
- New `PROJECT_MANAGER` role.
- New `Client`, `Invoice`, `InvoiceLineItem`, `InvoiceAttachment` data models —
  entirely separate from the existing `Employee`/`Document` tables (no schema
  changes to Phase 1/2 models).
- Free-form line items (description + amount) entered by the PM. Not
  calculated from employee pay/bill rates.
- File attachments (e.g. timesheets) uploaded by the PM, reusing the existing
  storage adapter (local disk → DigitalOcean Spaces) under an
  `invoices/<invoiceId>/...` key prefix.
- An optional "grid export" attachment: a CSV snapshot of employee grid rows
  the PM selects, respecting the PM's own column access.
- A five-state approval lifecycle with a reject-back-to-draft path at each
  review stage.
- Emailing the invoice + attachments to the client via the existing pluggable
  email layer, and status-change notification emails between roles.

Out of scope (explicitly deferred):
- Any integration with the existing `Employee`/`Document` tables (e.g. tying
  a line item to a specific employee, or reusing `Document` for attachments).
  The user asked to build this separately now and integrate later.
- Rate-based/calculated line items (pay rate × hours).
- In-app timesheet data entry — timesheets are just uploaded files.
- PDF invoice generation — the emailed packet is the line items + attached
  files, not a formatted PDF document (can be added later).

## Roles

Add `PROJECT_MANAGER` to `ROLES` in `src/lib/rbac.ts`, alongside the existing
8 roles (`EMPLOYEE`, `TRACKS`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_LEAD`,
`SAFETY`, `ADMIN`, `SUPER_ADMIN`). It is distinct from `PROJECT_LEAD`.

Invoice permissions are **not** governed by the `ColumnAccess` matrix (that
system is scoped to the employee grid). Instead, invoice server actions and
pages check role directly, the same pattern already used for
`ADMIN_ROLES`/`isAdminRole()`:

- `PROJECT_MANAGER`: create/edit invoices in `DRAFT`, submit for review, view
  own invoices at all statuses (read-only once submitted), sees own
  rejections.
- `ACCOUNT_MANAGER`: view `SUBMITTED` queue, approve → `AM_APPROVED`, or
  reject → `DRAFT` with a reason.
- `ADMIN` / `SUPER_ADMIN`: view `AM_APPROVED` queue, approve → triggers send
  (`ADMIN_APPROVED` → `SENT`), or reject → `DRAFT` with a reason. Also
  unrestricted view of all invoices (consistent with existing admin
  behavior elsewhere in the app).
- Other roles: no invoice access in this phase.

## Data model

```prisma
model Client {
  id        String    @id @default(cuid())
  name      String
  email     String
  site      String
  createdAt DateTime  @default(now())
  invoices  Invoice[]
}

model Invoice {
  id               String    @id @default(cuid())
  clientId         String
  client           Client    @relation(fields: [clientId], references: [id])
  site             String
  status           String    @default("DRAFT")
  // DRAFT | SUBMITTED | AM_APPROVED | ADMIN_APPROVED | SENT
  createdByUserId  String
  rejectionReason  String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  sentAt           DateTime?

  lineItems   InvoiceLineItem[]
  attachments InvoiceAttachment[]
}

model InvoiceLineItem {
  id          String   @id @default(cuid())
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId   String
  description String
  amount      Float
  createdAt   DateTime @default(now())
}

model InvoiceAttachment {
  id         String   @id @default(cuid())
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId  String
  // TIMESHEET | GRID_EXPORT | OTHER
  category   String
  fileName   String
  storageKey String
  mimeType   String
  size       Int
  createdAt  DateTime @default(now())
}
```

## Status lifecycle

```
DRAFT --submit--> SUBMITTED --AM approves--> AM_APPROVED --Admin approves--> ADMIN_APPROVED --system sends--> SENT
  ^                    |                          |
  |__________reject (AM, with reason)_____________|
  |__________reject (Admin, with reason)_______________________________________|
```

- `DRAFT`: PM builds the invoice — selects/creates a `Client` (per site),
  adds free-form line items, uploads attachments (timesheets, etc.),
  optionally generates a grid-export attachment. Only the creating PM (and
  Admins) can edit.
- `SUBMITTED`: read-only to the PM. Visible in the Account Manager's review
  queue.
- `AM_APPROVED`: AM has approved ("complete"). Visible in the Admin's final
  review queue. Read-only to AM and PM.
- `ADMIN_APPROVED` → `SENT`: Admin approval immediately triggers the send —
  these two transitions happen in one server action (approve = send). The
  system emails `Client.email` with the line items and all attachments, then
  stamps `sentAt` and sets status `SENT`. Terminal state; no further edits.
- Rejection at either review stage sets status back to `DRAFT`, records
  `rejectionReason`, and emails the PM.

## Attachments & grid export

- Regular attachments: PM uploads files directly on the invoice's `DRAFT`
  page, stored via the existing storage adapter under
  `invoices/<invoiceId>/<category>-<id>-<filename>`, mirroring the existing
  `library/<Employee_Name>/...` key convention for employee documents.
- Grid export: on the same page, PM picks employees from a site-filtered
  grid view (reusing existing grid-rendering logic, but a new read path —
  not wired into `ColumnAccess`, just filtered to columns the PM's own
  access map marks as viewable). Clicking "Attach grid snapshot" generates a
  CSV server-side and stores it as an `InvoiceAttachment` with category
  `GRID_EXPORT`.

## Pages

- `/invoices` — role-scoped list:
  - PM: their own invoices, all statuses.
  - AM: `SUBMITTED` queue (plus their own history of decisions).
  - Admin/Super Admin: `AM_APPROVED` queue, plus unrestricted view of all
    invoices/statuses.
- `/invoices/new` — PM-only creation form (client picker/create, line items,
  attachments).
- `/invoices/[id]` — detail page: client, line items, attachments, status,
  rejection reason if any, and the action button(s) valid for the viewer's
  role at the current status (Submit / Approve / Reject / — Admin's Approve
  doubles as Send).

## Notifications (existing pluggable email layer)

- PM submits → email to Account Manager(s) for that site.
- AM approves → email to Admin(s).
- AM or Admin rejects → email to the PM with the rejection reason.
- Admin approves → email to the client (the actual invoice send), separate
  from the internal notification emails above.

## Error handling

- Every state-transition server action re-checks the invoice's current
  status server-side before applying a transition (defense in depth,
  matching the existing pattern for `ColumnAccess` checks) — prevents a
  stale page from double-submitting or approving out of order.
- Sending to the client is the one transition with an external side effect;
  if the email send fails, the action must not advance status to `SENT` —
  it stays `ADMIN_APPROVED` and the Admin can retry.
- Line items require a non-empty description and a positive amount;
  submitting a `DRAFT` with zero line items is blocked.

## Testing

- Server actions enforce role + status checks directly (not just hidden UI),
  consistent with Phase 2.
- Manual browser verification: full `DRAFT → SENT` happy path for one
  invoice, plus one rejection loop (AM rejects → PM edits → resubmits →
  approved), using existing dev accounts plus a new PM test user
  (`pm@fer.local`).

## Explicit non-goals for this phase

- No tie-in to `Employee`/`Document` tables yet (deferred, per user).
- No PDF generation — attachments + line items are sent as-is.
- No rate-calculated line items.
