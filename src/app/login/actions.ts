"use server";

import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export type LoginResult = { ok: false; error: string } | undefined;

export async function login(_prev: LoginResult, form: FormData): Promise<LoginResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!email || !password) return { ok: false, error: "Email and password are required." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/admin/grid");
}
