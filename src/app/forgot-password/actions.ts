"use server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { nanoid } from "nanoid";

export type ForgotPasswordResult = { ok: true } | { ok: false; error: string };

const RESET_TOKEN_HOURS = 1;

export async function requestPasswordReset(
  _prev: ForgotPasswordResult | undefined,
  form: FormData,
): Promise<ForgotPasswordResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond the same way whether or not the account exists, so this
  // form can't be used to discover which emails have accounts.
  if (user && user.active) {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const url = `${base}/reset-password/${token}`;
    const greeting = user.name ? `Hi ${user.name},` : "Hello,";
    await sendEmail({
      to: user.email,
      subject: "Reset your FER password",
      html: `<p>${greeting}</p>
<p>Someone requested a password reset for your FER account. If this was you, set a new password here:</p>
<p><a href="${url}">${url}</a></p>
<p>This link expires in ${RESET_TOKEN_HOURS} hour. If you didn't request this, you can ignore this email.</p>`,
    });
  }

  return { ok: true };
}
