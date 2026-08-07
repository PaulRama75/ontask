"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">FER</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">Access the employee data system.</p>

        <label className="mt-6 block text-sm font-medium text-gray-700">Email</label>
        <input
          name="email"
          type="email"
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
        />

        <label className="mt-4 block text-sm font-medium text-gray-700">Password</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
        />

        {state?.ok === false && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
