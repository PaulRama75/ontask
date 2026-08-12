import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900/60 p-8 text-center shadow-lg shadow-black/40 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
          FER
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Employee Onboarding
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Phase 1 — onboarding link forms, document upload, and an admin view.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500"
        >
          Go to Admin
        </Link>
      </div>
    </main>
  );
}
