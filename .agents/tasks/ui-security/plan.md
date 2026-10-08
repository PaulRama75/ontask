# Implementation Plan — Generalize PIN-gated secret fields + responsive grid + dark-theme polish

## Context notes (grounded in the worktree, read before implementing)

- Worktree root (ALL paths are relative to it; relative paths from elsewhere land in the parent repo and are wrong):
  `c:\Sir project\ontask\.worktrees\security-pin` (branch `feature/security-pin`).
- There is NO design.md and NO `.agents/tasks/ui-security` design doc in the repo. The task prompt's "WHAT TO BUILD" section is the source of truth; this plan is derived from it plus the actual code read in the worktree.
- NO test runner. Verify ONLY with (run from the worktree root):
  - `npx prisma generate` (after any schema change — none is expected here)
  - `npx tsc --noEmit` → zero errors
  - `npm run build` → exit 0
- Next.js 16 (App Router, Turbopack, React 19, TS, Tailwind v4). AGENTS.md requires reading `node_modules/next/dist/docs/` before writing code; match the stable conventions already in neighboring files (`"use server"`, `await params`, `await cookies()`, `await searchParams`). The docs folder is present.
- Schema check DONE: `driversLicenseNumber`, `safetyCouncilId`, `twicNumber` are already `String?` on model Employee; `safetyCouncilExpiry`/`twicExpiry` are `DateTime?`. Making the three IDs encrypted-at-rest is NO schema shape change → **NO Prisma migration is required.** (Say so; do not add one.)
- FIX 1 (verified): the entire employee-detail "Details" `<dl>` (SSN, Driver's license, Safety Council ID, TWIC #) sits inside `{canFullView && (...)}` (page.tsx ~line 558). `canFullView = canLib || assignedToMe || granted`, where `canLib = canView(access,"library") || hasFullDocumentAccess`. By rbac defaults only HR gets `library: VIEW`; SAFETY/ACCOUNT_MANAGER/PROJECT_MANAGER/TRACKS/EMPLOYEE default to `library: HIDDEN` and are redirected before Details. SAFETY therefore NEVER reaches the Details section — do NOT claim SAFETY gains ID visibility. Non-admin roles that both clear `canFullView` by default AND can hold a field-view key: effectively **HR only** (plus a per-employee-assigned PL/PM or a one-off grant, which are per-row not per-role). The per-field guard tightening must not expose any field to a role that cannot already see it.
- `employeeImport.ts` in THIS worktree has only a `createMany` path (`importRows`) — there is NO update branch and NO ciphertext-equality duplicate check. Encrypt the three IDs at the single write point that exists; if a future update branch is added it must encrypt too. (The prompt's "both branches / compare via decrypt" describes a superset; implement what the code actually has and note it.)
- rbac grid column keys: there is a `driverLicense` key but NO `safetyCouncil`/`twic` ID key — only `safetyExpiry`/`twicExpiry`. On the detail page the three IDs are gated per-field by: ssn→`canView(access,"ssn")`, driver's license→`canView(access,"driverLicense")`, Safety Council ID→`canView(access,"safetyExpiry")`, TWIC #→`canView(access,"twicExpiry")`. These view keys already gate the matching grid columns, so no role gains new visibility.

---

- [ ] 1. Generalize crypto primitives in `src/lib/crypto.ts`.
      Add `maskLast4(decrypted: string | null): string` holding the current masking body; make `maskSsn` delegate to it (keep `maskSsn` working and exported unchanged in behavior). Add `encField(value: string | null | undefined): string | null` = generic encryptor mirroring `encSsn` (trim, empty→null, else `encryptSecret`), **with FIX 5 idempotency as the FIRST line: `if (typeof value === "string" && isEncrypted(value)) return value;`** so a missed prefill-decrypt cannot double-encrypt. Keep `encSsn` as a thin wrapper over `encField` (or leave as-is). Do not change `encryptSecret`/`decryptSecret`/`isEncrypted`/`safeDecrypt`.
      Files: `src/lib/crypto.ts`
      Verify: `npx tsc --noEmit` (zero errors) and `npm run build` (exit 0) from the worktree root.

- [ ] 2. Generalize the reveal server action in `src/app/admin/pin/actions.ts`.
      Add `revealField(pin, employeeId, field)` for `field ∈ {"ssn","driversLicense","safetyCouncil","twic"}` with the SAME 3-part additive gate as `revealSsn` (per-field `canView` ∧ `canFullView` ∧ non-admin site restriction) and HARD `decryptSecret`→`DECRYPT_FAILED`. Map each field to its column + its view key: ssn→`e.ssn`/`"ssn"`, driversLicense→`e.driversLicenseNumber`/`"driverLicense"`, safetyCouncil→`e.safetyCouncilId`/`"safetyExpiry"`, twic→`e.twicNumber`/`"twicExpiry"`. **FIX 2 companion: read the column via a `satisfies Prisma.EmployeeSelect` select and a direct `e[column]` read — do NOT use `select: { [column]: true } as const`.** Keep a `revealSsn` wrapper delegating to `revealField(pin, employeeId, "ssn")` so existing callers compile. Define/export a shared `SecretFieldKey` type (`"ssn"|"driversLicense"|"safetyCouncil"|"twic"`) usable by the client components.
      Files: `src/app/admin/pin/actions.ts`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 3. Generalize `SsnField.tsx` → reusable `SecretField` and update the single current SSN caller note.
      Rename/retype `src/app/admin/SsnField.tsx` to export `SecretField({ maskedValue, employeeId, field, label, canReveal })`; keep the SSN visual behavior. Call `revealField(pin, employeeId, field)`. **FIX 1+4: render the eye ONLY when `canReveal` is true** (no dead-end FORBIDDEN eye for VIEW-only-no-library roles like TRACKS). **FIX 4 comment: in the grid both the table and card instances are MOUNTED (CSS-hidden), so per-instance reveal state is fine ONLY because SecretField has no mount-time side effect (no autofocus/auto-open) — keep it that way.** `aria-label`/`title` must read "<label>" (e.g. "Reveal Driver's license"). Keep a thin `SsnField` export (or update callers in step 7/8) so nothing breaks mid-way.
      Files: `src/app/admin/SsnField.tsx` (becomes `SecretField`)
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 4. Generalize `SsnEditCell.tsx` → `SecretEditCell`.
      Rename/retype `src/app/admin/grid/SsnEditCell.tsx` to `SecretEditCell({ employeeId, maskedValue, field, canReveal, label })`. Reveal via `revealField`. **FIX 3: dispatch save/clear by field via an explicit lookup** `const WRITE_ACTION: Partial<Record<SecretFieldKey,(fd:FormData)=>Promise<GatedResult>>> = { ssn: setEmployeeSsn, driversLicense: setEmployeeDriversLicense };` — a DL save must route through the DL action, never the SSN column. Keep the empty-save-no-op + explicit-clear-null contract. Only show the eye when `canReveal`.
      Depends on: step 5 (the `setEmployeeDriversLicense` action must exist to import). Do step 5 first, or stub the lookup to `{ ssn: setEmployeeSsn }` and extend after step 5.
      Files: `src/app/admin/grid/SsnEditCell.tsx` (becomes `SecretEditCell`)
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 5. Add a dedicated PIN-gated DL write action in `src/app/admin/actions.ts`.
      Add `setEmployeeDriversLicense(formData): Promise<GatedResult>` that is byte-for-byte `setEmployeeSsn` with ssn→driverLicense: `requireColumn("driverLicense","edit",id)`, `checkPin`, empty-save-no-op, explicit-clear→`{ driversLicenseNumber: null }`, else `{ driversLicenseNumber: encField(value) }`, same `GatedResult`, `revalidatePath("/admin/grid")`. Import `encField`. Leave the `setEmployeeField` `"driverLicense"` case dead (single authoritative write path) — or route it through `encField` too; prefer leaving the dedicated action as the only write path and NOT exposing the plain `setEmployeeField` DL case in the grid.
      Files: `src/app/admin/actions.ts`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 6. Encrypt the three IDs on every WRITE path.
      (a) `src/app/onboard/[token]/actions.ts` — in BOTH `submitOnboarding` and `saveOnboardingDraft`, wrap `driversLicenseNumber`, `safetyCouncilId`, `twicNumber` writes with `encField(...)` (import it). (b) `src/lib/employeeImport.ts` — in the record build (the `createMany` path via `importRows`), encrypt the three IDs with `encField` at WRITE time; this worktree has only the `createMany` path (no update branch) — note that in a comment. Keep `ssn: encSsn(...)` as-is. (c) Prefill-decrypt read: `src/app/onboard/[token]/page.tsx` — `safeDecrypt` the three IDs (and keep SSN as it is) before prefilling the form so a resubmit does not double-encrypt (`encField` idempotency from FIX 5 is the backstop).
      Files: `src/app/onboard/[token]/actions.ts`, `src/lib/employeeImport.ts`, `src/app/onboard/[token]/page.tsx`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 7. Convert the employee-detail Details rows to masked `SecretField` under per-field guards.
      `src/app/admin/employee/[id]/page.tsx` — inside the `{canFullView && (...)}` Details `<dl>`, replace the plain `<Detail label="Driver's license">`, `<Detail label="Safety Council ID">`, `<Detail label="TWIC #">` rows with the SSN `dt/dd` shape rendering `SecretField` with server-computed `maskLast4(safeDecrypt(e.<col>))`, `field`, `label`, and `canReveal` = the matching per-field `canView` guard (driver's license→`canView(access,"driverLicense")`, safety→`canView(access,"safetyExpiry")`, twic→`canView(access,"twicExpiry")`). Wrap each row in its `canView` guard (deliberate, documented tightening — does NOT expose any field to a role that cannot already see it, per the FIX 1 note above). SSN row already uses this shape; align it to `SecretField` with `field="ssn"` and `canReveal={canView(access,"ssn")}`. Never pass ciphertext to the client — only the masked string.
      Files: `src/app/admin/employee/[id]/page.tsx`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 8. Convert the grid Driver License cell to masked `SecretField`/`SecretEditCell` and fix search.
      `src/app/admin/grid/page.tsx` — the `driverLicense` cell: when `editable("driverLicense")` render `SecretEditCell` with `field="driversLicense"`, `maskedValue={maskLast4(safeDecrypt(e.driversLicenseNumber))}`, `canReveal={show("driverLicense")}`; else render `SecretField` the same way. Server computes the masked value; the client gets only masked string + employeeId + field + canReveal, NEVER ciphertext. Grid search (~line 156, the `haystack`): replace the raw `e.driversLicenseNumber` term with `safeDecrypt(e.driversLicenseNumber)` so search matches the plaintext (mirrors the existing SSN decrypt-then-match). Keep DocLinks/UploadCell exactly as they are. Update SSN cell to `SecretField`/`SecretEditCell` with `field="ssn"` + `canReveal={show("ssn")}` for consistency.
      Files: `src/app/admin/grid/page.tsx`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 9. Mask the DL column in the invoices CSV export.
      `src/app/admin/invoices/actions.ts` — the `"driverLicense"` case in `employeeFieldValue` currently returns `e.driversLicenseNumber ?? ""` (would emit ciphertext). Change it to `maskLast4(safeDecrypt(e.driversLicenseNumber))` (**FIX 2**: `maskSsn` is already imported and delegates to `maskLast4` — reuse `maskSsn`, OR add `maskLast4` to the import; pick ONE and make it compile). NEVER emit DL ciphertext to the CSV. SSN case already masks — leave it.
      Files: `src/app/admin/invoices/actions.ts`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 10. Add the idempotent data-migration script `scripts/encrypt-id-fields.cjs`.
      Mirror `scripts/encrypt-ssns.cjs` (CommonJS). Encrypt any non-null `driversLicenseNumber`/`safetyCouncilId`/`twicNumber` not already `enc:v1:`. Idempotent (a second run encrypts 0, skips the rest). Load `DATABASE_URL` + `SSN_ENCRYPTION_KEY` from env with the same `.env` fallback as the SSN script — reuse the SAME `SSN_ENCRYPTION_KEY`; do NOT generate a new key. Log COUNTS only (and row id on per-row failure); never log a field value or ciphertext. Document the PowerShell run command in a header comment:
      `$env:SSN_ENCRYPTION_KEY = (Get-Content .env | Select-String '^SSN_ENCRYPTION_KEY=').ToString().Split('=',2)[1].Trim('"'); node scripts/encrypt-id-fields.cjs`
      Files: `scripts/encrypt-id-fields.cjs`
      Verify: run the documented command from the worktree root; it prints `Encrypted N, skipped M…`. Run it a SECOND time and confirm it encrypts 0 (idempotent). (Not part of tsc/build; runtime-only.)

- [ ] 11. Grid responsive redesign — freeze first column + card view.
      `src/app/admin/grid/page.tsx` (extract small presentational subcomponents under `src/app/admin/grid/` if the file gets unwieldy, but keep ALL data-fetching server-side in `page.tsx`). (1) Freeze the Employee column: `position: sticky; left: 0` on both its `th` and `td` with a right-edge shadow; keep the existing sticky-top header; explicit z-index layering (frozen body cell below header row, header corner cell highest). Handle the approved-row highlight on the opaque frozen cell via an inset-ring token (so the frozen cell's own background doesn't hide the `bg-emerald-500/10` row tint). (2) Add a CARD view: wrap the table in `hidden md:table` (or a `md:block` wrapper) and add a `md:hidden` stacked-card list — each employee is a card with a name+status-pill header then label/value rows including the masked IDs (same `SecretField`, eye reveal) and the per-row doc/action links. Both views read the SAME server data and preserve ALL functionality: edit cells, PIN reveals, doc links, duplicate badge, approved highlight, archived handling. Per-instance reveal state across the two mounted views is acceptable (see step 3 FIX 4 note).
      Files: `src/app/admin/grid/page.tsx` (+ any new `src/app/admin/grid/*` cell/card components)
      Verify: `npx tsc --noEmit`; `npm run build`. Manually/visually: at <768px the card list shows and the table is hidden; at ≥768px the table shows with a frozen first column.

- [ ] 12. Extract shared dark-theme tokens + `StatusPill`.
      Create `src/lib/ui.ts` exporting class-string constants used across the app (`cardClass`, `primaryButtonClass`, `inputClass`, `thClass`, `tdClass`, `pageClass`, etc. — collect the strings already duplicated in grid/PinDialog/detail pages). Create a small `StatusPill` component (emerald = active/approved, slate = inactive/pending) in `src/app/admin/` (server component, markup only). Palette per the approved mockup: dark slate (`#0b1120`/`#0f172a`), cyan→blue gradient accents (`#22d3ee`→`#3b82f6`), rounded-xl cards with `white/10` borders + soft shadows, uppercase tracked column headers, gradient primary buttons.
      Files: `src/lib/ui.ts`, `src/app/admin/StatusPill.tsx`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 13. Roll the refined dark-theme styling across the app (RESTYLE ONLY).
      Apply `src/lib/ui.ts` tokens + `StatusPill` to: `src/app/admin/layout.tsx`, the grid (table + cards), `src/app/admin/profile/*`, `src/app/admin/invoices/**`, timesheets, users, `src/app/login`, `src/app/onboard/**`, and shared dialogs (`PinDialog.tsx` — polish per mockup: lock badge, large centered PIN input, gradient confirm button). This is className/markup-structure change for appearance ONLY: do NOT change business logic, server actions, data flow, routes, or RBAC. Keep accessibility: focus states, `aria-label`s on eye buttons, dialog `role="dialog"`/`aria-modal`. Batch same-pattern className edits per file.
      Files: `src/app/admin/layout.tsx`, `src/app/admin/grid/page.tsx` (+ grid cells), `src/app/admin/profile/**`, `src/app/admin/invoices/**`, `src/app/admin/timesheets/**`, `src/app/admin/users/**`, `src/app/login/**`, `src/app/onboard/**`, `src/app/admin/PinDialog.tsx`
      Verify: `npx tsc --noEmit`; `npm run build`.

- [ ] 14. Final verification pass (from the worktree root).
      Run, in order: `npx prisma generate` (schema unchanged, but confirm the client is current), `npx tsc --noEmit` (zero errors), `npm run build` (exit 0). Confirm no client component receives ciphertext or raw secrets (grep that `SecretField`/`SecretEditCell`/card props only ever get `maskLast4(...)`/`maskSsn(...)` outputs, employeeId, field, canReveal). Confirm the eye renders only when `canReveal` is true. Re-run `scripts/encrypt-id-fields.cjs` once more to confirm 0 further encryptions (idempotent). Confirm no new Prisma migration was added (none is needed).
      Files: (none — verification only)
      Verify: all three commands succeed; migration script second run reports 0 encrypted.

## Hard rules (apply throughout)
- PIN is strictly ADDITIVE; never weaken existing role/ownership/site auth.
- Masked last-4 renders ONLY inside the same per-field view guard that gates reveal; roles that cannot view a field see `—`, never last-4, and get no eye.
- No raw/ciphertext secret ever reaches a client component — only the server-computed masked string; reveal is always a server round-trip re-checking the PIN every time.
- `revealField` decrypt is HARD→`DECRYPT_FAILED`; display paths use `safeDecrypt`+mask so legacy/corrupt rows still mask without crashing.
- `encField` is idempotent (FIX 5).
