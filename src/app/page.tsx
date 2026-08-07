import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          FER
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Employee Onboarding
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Phase 1 — onboarding link forms, document upload, and an admin view.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Admin
        </Link>
      </div>
    </main>
  );
}
