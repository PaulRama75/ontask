"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { primaryButtonClass, secondaryButtonClass, errorBoxClass } from "@/lib/ui";

export type PinConfirmResult = {
  ok: boolean;
  error?: string;
  pinRequired?: boolean;
};

// Large, centered, letter-spaced PIN entry per the mockup.
const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-3 text-center text-lg tracking-[0.6em] text-white placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400";
const confirmButtonClass = primaryButtonClass;
const cancelButtonClass = secondaryButtonClass;

// Shared modal that collects a 4-6 digit security PIN and hands it to the
// caller's onConfirm. The caller returns a result; when the result reports
// pinRequired (the NO_PIN code) the dialog shows a set-up CTA instead of a
// retry prompt. Styling matches the login card / profile forms.
export default function PinDialog({
  open,
  onConfirm,
  onCancel,
  title = "Enter your security PIN",
  description,
}: {
  open: boolean;
  onConfirm: (pin: string) => Promise<PinConfirmResult>;
  onCancel: () => void;
  title?: string;
  description?: string;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setError(null);
      setNeedsSetup(false);
      setPending(false);
      // Focus after the dialog paints.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await onConfirm(pin);
      if (res.ok) return; // caller closes/navigates on success
      if (res.pinRequired) {
        setNeedsSetup(true);
      } else {
        setError(res.error || "Something went wrong.");
        setPin("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl shadow-black/50">
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-lg shadow-cyan-500/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <h2 className="mt-3 text-lg font-semibold text-white">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
        </div>

        {needsSetup ? (
          <div className="mt-4">
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
              You haven&apos;t set a security PIN yet.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className={cancelButtonClass}>
                Close
              </button>
              <Link href="/admin/profile#pin" className={confirmButtonClass}>
                Set up your PIN
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5">
            <label className="block text-center text-sm font-medium text-slate-300">PIN</label>
            <input
              ref={inputRef}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              className={inputClass}
            />

            {error && <p className={`mt-3 ${errorBoxClass}`}>{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className={cancelButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={pending} className={confirmButtonClass}>
                {pending ? "Verifying…" : "Confirm"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
