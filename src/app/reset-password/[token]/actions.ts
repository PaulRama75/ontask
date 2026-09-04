"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { redirect } from "next/navigation";

export type ResetPasswordResult = { ok: false; error: string } | undefined;

export async function resetPassword(
  _prev: ResetPasswordResult,
  form: FormData,
): Promise<ResetPasswordResult> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!token) return { ok: false, error: "Missing reset token." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "Passwords don't match." };

  const reset = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired. Request a new one." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
    // Sign out everywhere else once the password changes.
    prisma.session.deleteMany({ where: { userId: reset.userId } }),
  ]);

  redirect("/login");
}
