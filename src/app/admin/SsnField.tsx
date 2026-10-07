"use client";

import { useState } from "react";
import PinDialog, { type PinConfirmResult } from "./PinDialog";
import { revealSsn } from "./pin/actions";

// Masked SSN display with a PIN-gated eye reveal. Receives ONLY the
// server-computed masked value (e.g. "•••••1234") and the employeeId — never
// the raw or ciphertext SSN. Clicking the eye opens the shared PinDialog,
// which calls revealSsn(pin, employeeId); on success the full SSN is shown and
// clicking again drops it from state (re-fetched on the next reveal). BAD_PIN
// allows a retry and NO_PIN surfaces the setup CTA (both handled inside
// PinDialog); FORBIDDEN / DECRYPT_FAILED render inline without a retry prompt,
// since re-entering the PIN cannot fix a hidden-by-role or corrupt row.
export default function SsnField({
  maskedSsn,
  employeeId,
}: {
  maskedSsn: string;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function onConfirm(pin: string): Promise<PinConfirmResult> {
    const res = await revealSsn(pin, employeeId);
    if (res.ok) {
      setRevealed(res.ssn);
      setOpen(false);
      return { ok: true };
    }
    if (res.code === "NO_PIN") {
      return { ok: false, pinRequired: true };
    }
    // BAD_PIN retries; FORBIDDEN / DECRYPT_FAILED show the message inline.
    return { ok: false, error: res.error };
  }

  function toggle() {
    if (revealed !== null) {
      setRevealed(null); // hide and drop from state
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <span>{revealed !== null ? revealed || "—" : maskedSsn}</span>
        <button
          type="button"
          onClick={toggle}
          aria-label={revealed !== null ? "Hide SSN" : "Reveal SSN"}
          title={revealed !== null ? "Hide SSN" : "Reveal SSN"}
          className="text-slate-400 transition-colors hover:text-cyan-400"
        >
          {revealed !== null ? (
            // eye-off
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            // eye
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </span>
      <PinDialog
        open={open}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        title="Reveal SSN"
        description="Enter your security PIN to view the full Social Security Number."
      />
    </>
  );
}
