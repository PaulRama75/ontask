"use server";

import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  verifyPassword,
  hashPassword,
  verifyPin,
  hashPin,
} from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ProfileResult = { ok: true } | { ok: false; error: string } | undefined;

export async function updateName(_prev: ProfileResult, form: FormData): Promise<ProfileResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const raw = String(form.get("name") ?? "").trim();
  if (raw.length > 200) return { ok: false, error: "Name must be 200 characters or fewer." };
  const name = raw.length === 0 ? null : raw;

  await prisma.user.update({ where: { id: me.id }, data: { name } });

  revalidatePath("/admin/profile");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function changePassword(_prev: ProfileResult, form: FormData): Promise<ProfileResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return { ok: false, error: "Not signed in." };

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "New passwords do not match." };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: hashPassword(newPassword) },
  });

  return { ok: true };
}

export async function setPin(_prev: ProfileResult, form: FormData): Promise<ProfileResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const newPin = String(form.get("newPin") ?? "");
  const confirmPin = String(form.get("confirmPin") ?? "");
  const currentCredential = String(form.get("currentCredential") ?? "");

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return { ok: false, error: "Not signed in." };

  if (!user.pinHash) {
    // First-time setup: require the current password to establish a PIN.
    if (!verifyPassword(currentCredential, user.passwordHash)) {
      return { ok: false, error: "Current password is incorrect." };
    }
  } else {
    // Changing an existing PIN: accept either the current PIN or password.
    if (
      !verifyPin(currentCredential, user.pinHash) &&
      !verifyPassword(currentCredential, user.passwordHash)
    ) {
      return { ok: false, error: "Current password or PIN is incorrect." };
    }
  }

  if (!/^\d{4,6}$/.test(newPin)) {
    return { ok: false, error: "PIN must be 4 to 6 digits." };
  }
  if (newPin !== confirmPin) {
    return { ok: false, error: "PINs do not match." };
  }

  await prisma.user.update({ where: { id: me.id }, data: { pinHash: hashPin(newPin) } });

  return { ok: true };
}
