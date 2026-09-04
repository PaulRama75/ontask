"use client";

import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl animate-pulse"
          style={{ animationDelay: "1.5s" }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <form
        action={formAction}
        className="relative w-full max-w-sm rounded-xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <Image src="/logoblack.png" alt="FER" width={56} height={36} className="h-10 w-auto drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]" priority />
          <div>
            <h1 className="text-xl font-bold text-white">Sign in</h1>
            <p className="text-xs text-slate-400">Employee data system</p>
          </div>
        </div>

        <label className="mt-7 block text-sm font-medium text-slate-300">Email</label>
        <input
          name="email"
          type="email"
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        />

        <div className="mt-4 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-300">Password</label>
          <Link href="/forgot-password" className="text-xs text-cyan-400 hover:text-cyan-300">
            Forgot password?
          </Link>
        </div>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        />

        {state?.ok === false && (
          <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-300">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] hover:shadow-cyan-500/40 disabled:scale-100 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
