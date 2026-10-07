"use server";

import { requirePin } from "@/lib/auth";
import { mintUnlock, type UnlockScope } from "@/lib/pinGate";

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
