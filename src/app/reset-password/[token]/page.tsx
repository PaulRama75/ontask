import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await prisma.passwordResetToken.findUnique({ where: { token } });
  const valid = reset && !reset.usedAt && reset.expiresAt > new Date();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/40 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-400">FER</p>
        <h1 className="mt-1 text-xl font-bold text-white">Set a new password</h1>

        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <p className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="mt-4 block text-center text-sm text-cyan-400 hover:text-cyan-300"
            >
              Request a new link
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
