import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE = "fer_session";
const SESSION_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${dk}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const dk = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === dk.length && timingSafeEqual(keyBuf, dk);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${dk}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const dk = scryptSync(pin, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === dk.length && timingSafeEqual(keyBuf, dk);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  hasFullDocumentAccess: boolean;
};

// Create a session row and set the cookie. Call from a server action / route.
export async function createSession(userId: string): Promise<void> {
  const token = randomUUID() + randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    jar.delete(COOKIE);
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) {
    return null;
  }
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    hasFullDocumentAccess: u.hasFullDocumentAccess,
  };
}

export type RequirePinResult =
  | { ok: true; userId: string }
  | { ok: false; code: "NO_USER" | "NO_PIN" | "BAD_PIN"; error: string };

// Verify the caller's security PIN fresh on every call. pinHash is NOT part of
// SessionUser, so it is re-read from the DB each time — no caching, no window.
export async function requirePin(pin: string): Promise<RequirePinResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, code: "NO_USER", error: "Not signed in." };

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { pinHash: true },
  });
  if (!user) return { ok: false, code: "NO_USER", error: "Not signed in." };
  if (!user.pinHash) {
    return { ok: false, code: "NO_PIN", error: "You must set a security PIN first." };
  }
  if (!/^\d{4,6}$/.test(pin) || !verifyPin(pin, user.pinHash)) {
    return { ok: false, code: "BAD_PIN", error: "Incorrect security PIN." };
  }
  return { ok: true, userId: me.id };
}
