import { cookies } from "next/headers";
import { randomUUID, createHash } from "crypto";
import { prisma } from "./prisma";
import { getCurrentUser } from "./auth";

const UNLOCK_COOKIE = "fer_pin_unlock";
const TTL_MS = 60_000; // 60s: long enough to click through, short enough to be useless if leaked

export type UnlockScope = "file" | "export" | "ssn";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Mint a single-use, scope-bound unlock. Creates a DB row keyed by sha256 of a
// random token and sets the raw token as an HttpOnly cookie (same option shape
// as createSession). Must be called from a server action, not a GET route.
export async function mintUnlock(userId: string, scope: UnlockScope): Promise<void> {
  // Opportunistic cleanup of expired rows — fire-and-forget, never awaited.
  void prisma.pinUnlockToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const raw = randomUUID() + randomUUID();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.pinUnlockToken.create({
    data: { tokenHash: sha256(raw), userId, scope, expiresAt },
  });

  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

// Consume the unlock for the given scope. One atomic updateMany enforces
// ownership, scope, expiry and single-use together; replay matches zero rows.
// Returns true only when exactly one row transitioned to used.
export async function consumeUnlock(scope: UnlockScope): Promise<boolean> {
  const me = await getCurrentUser();
  if (!me) return false;

  const jar = await cookies();
  const raw = jar.get(UNLOCK_COOKIE)?.value;
  if (!raw) return false; // nothing to consume; no cookie mutation here

  const now = new Date();
  const res = await prisma.pinUnlockToken.updateMany({
    where: {
      tokenHash: sha256(raw),
      userId: me.id, // ownership enforced INSIDE the guard
      scope, // scope enforced INSIDE the guard
      usedAt: null, // single-use enforced INSIDE the guard
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });

  // Best-effort cookie clear on the path that reached the DB guard. Correctness
  // does NOT depend on this delete — single-use is enforced by usedAt above.
  jar.delete(UNLOCK_COOKIE);
  return res.count === 1;
}
