"use server";

import { getCurrentUser, requirePin } from "@/lib/auth";
import { mintUnlock, type UnlockScope } from "@/lib/pinGate";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import {
  getAccessMap,
  canView,
  isAdminRole,
  isAssignedProjectLeadOrManager,
  hasEmployeeDocumentGrant,
} from "@/lib/rbac";

// Single entry point the client PIN UI calls to unlock a protected download.
// Verifies the PIN fresh (requirePin re-reads pinHash every call), and on
// success mints the scoped single-use unlock cookie the GET route consumes.
// Never logs the PIN or any secret. (revealSsn is added later in FEAT-005.)
export async function verifyPinForUnlock(
  pin: string,
  scope: UnlockScope,
): Promise<
  | { ok: true }
  | { ok: false; code: "NO_USER" | "NO_PIN" | "BAD_PIN"; error: string }
> {
  const r = await requirePin(pin);
  if (!r.ok) return r;
  await mintUnlock(r.userId, scope); // single identity from requirePin
  return { ok: true };
}

// The secret ID fields a correct PIN can reveal. Each maps to one encrypted
// Employee column and the rbac view-key that gates it.
export type SecretFieldKey = "ssn" | "driversLicense" | "safetyCouncil" | "twic";

type RevealResult =
  | { ok: true; value: string }
  | {
      ok: false;
      code: "NO_USER" | "NO_PIN" | "BAD_PIN" | "FORBIDDEN" | "DECRYPT_FAILED";
      error: string;
    };

// field -> { encrypted Employee column, rbac view-key }. The view-key is the
// same column key canView() checks when the page/grid decides whether to show
// the masked last-4 + eye, so the reveal gate can never exceed display gating.
const FIELD_MAP: Record<SecretFieldKey, { column: "ssn" | "driversLicenseNumber" | "safetyCouncilId" | "twicNumber"; viewKey: string }> = {
  ssn: { column: "ssn", viewKey: "ssn" },
  driversLicense: { column: "driversLicenseNumber", viewKey: "driverLicense" },
  safetyCouncil: { column: "safetyCouncilId", viewKey: "safetyExpiry" },
  twic: { column: "twicNumber", viewKey: "twicExpiry" },
};

// Reveal a single employee's full secret ID (SSN / driver's license / safety
// council / TWIC) after a correct PIN. The authorization reproduces EXACTLY
// the composite gate the employee detail page applies to render the field (see
// design §3.4): the field's column must be viewable for the role
// (canView(access, viewKey)), the user must be able to open that employee's
// full record (canFullView), and non-admins are confined to their assigned
// sites. The PIN is strictly additive on top of these checks. The reveal
// decrypt is HARD (not safeDecrypt) so a corrupt row never silently shows
// plaintext, but the throw is caught and mapped to a defined union member so
// the dialog can render it. Never logs the PIN, the value, or any ciphertext.
export async function revealField(
  pin: string,
  employeeId: string,
  field: SecretFieldKey,
): Promise<RevealResult> {
  const r = await requirePin(pin);
  if (!r.ok) return r; // NO_USER | NO_PIN | BAD_PIN

  const me = await getCurrentUser();
  if (!me) return { ok: false, code: "NO_USER", error: "Not signed in." };

  const { column, viewKey } = FIELD_MAP[field];

  const access = await getAccessMap(me.role);
  // (1) The field's column must be viewable for this role.
  if (!canView(access, viewKey)) return { ok: false, code: "FORBIDDEN", error: "Not available." };

  // FIX2: a `satisfies Prisma.EmployeeSelect` object (NOT a computed-key
  // `{ [column]: true } as const`, which does not type-check) selecting every
  // secret column plus the row-scope fields with literal keys, so the result
  // type stays narrowed; the value is then read via a direct e[column] access.
  const select = {
    ssn: true,
    driversLicenseNumber: true,
    safetyCouncilId: true,
    twicNumber: true,
    site: true,
    projectLeadEmail: true,
    projectManagerEmail: true,
    createdById: true,
  } satisfies Prisma.EmployeeSelect;

  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select });
  if (!e) return { ok: false, code: "FORBIDDEN", error: "Not available." }; // no existence leak

  // (2) The SAME row-scope the detail page applies.
  const canLib = canView(access, "library") || me.hasFullDocumentAccess;
  const granted = canLib ? false : await hasEmployeeDocumentGrant(me.id, employeeId);
  const canFullView = canLib || isAssignedProjectLeadOrManager(me, e) || granted;
  if (!canFullView) return { ok: false, code: "FORBIDDEN", error: "Not available." };

  // (3) Site restriction for non-admins (mirrors the detail page's redirect).
  if (!isAdminRole(me.role)) {
    const mine = await prisma.userSite.findMany({ where: { userId: me.id }, select: { site: true } });
    if (mine.length > 0 && !(e.site && mine.some((s) => s.site === e.site)))
      return { ok: false, code: "FORBIDDEN", error: "Not available." };
  }

  const stored = e[column];
  try {
    const value = stored ? decryptSecret(stored) : "";
    return { ok: true, value };
  } catch {
    // Log the row id + field ONLY -- never the stored value or any fragment.
    console.error(`revealField: ${field} decrypt failed for employee ${employeeId}`);
    return { ok: false, code: "DECRYPT_FAILED", error: "This value could not be read." };
  }
}

// SSN reveal: thin wrapper over revealField so existing callers keep the
// {ok:true; ssn} shape (value -> ssn).
export async function revealSsn(
  pin: string,
  employeeId: string,
): Promise<
  | { ok: true; ssn: string }
  | {
      ok: false;
      code: "NO_USER" | "NO_PIN" | "BAD_PIN" | "FORBIDDEN" | "DECRYPT_FAILED";
      error: string;
    }
> {
  const res = await revealField(pin, employeeId, "ssn");
  if (res.ok) return { ok: true, ssn: res.value };
  return res;
}
