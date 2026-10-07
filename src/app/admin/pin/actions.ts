"use server";

import { getCurrentUser, requirePin } from "@/lib/auth";
import { mintUnlock, type UnlockScope } from "@/lib/pinGate";
import { prisma } from "@/lib/prisma";
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

// Reveal a single employee's full SSN after a correct PIN. The authorization
// reproduces EXACTLY the composite gate the employee detail page applies to
// render the SSN (see design §3.4): the SSN column must be viewable for the
// role (canView(access,"ssn")), the user must be able to open that employee's
// full record (canFullView), and non-admins are confined to their assigned
// sites. The PIN is strictly additive on top of these checks. The reveal
// decrypt is HARD (not safeDecrypt) so a corrupt row never silently shows
// plaintext, but the throw is caught and mapped to a defined union member so
// the dialog can render it. Never logs the PIN, the SSN, or any ciphertext.
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
  const r = await requirePin(pin);
  if (!r.ok) return r; // NO_USER | NO_PIN | BAD_PIN

  const me = await getCurrentUser();
  if (!me) return { ok: false, code: "NO_USER", error: "Not signed in." };

  const access = await getAccessMap(me.role);
  // (1) SSN column must be viewable for this role.
  if (!canView(access, "ssn")) return { ok: false, code: "FORBIDDEN", error: "Not available." };

  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { ssn: true, site: true, projectLeadEmail: true, projectManagerEmail: true, createdById: true },
  });
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

  try {
    const ssn = e.ssn ? decryptSecret(e.ssn) : "";
    return { ok: true, ssn };
  } catch {
    // Log the row id ONLY -- never the stored value or any fragment of it.
    console.error(`revealSsn: SSN decrypt failed for employee ${employeeId}`);
    return { ok: false, code: "DECRYPT_FAILED", error: "This SSN could not be read." };
  }
}
