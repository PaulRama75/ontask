"use client";

import { useState } from "react";
import PinDialog, { type PinConfirmResult } from "./PinDialog";
import { revealField, type SecretFieldKey } from "./pin/actions";

// Masked secret-ID display with a PIN-gated eye reveal, reusable across every
// secret field (SSN, driver's license, safety council, TWIC). Receives ONLY
// the server-computed masked value (e.g. "•••••1234") and the employeeId —
// never the raw or ciphertext value. Clicking the eye opens the shared
// PinDialog, which calls revealField(pin, employeeId, field); on success the
// full value is shown and clicking again drops it from state (re-fetched on
// the next reveal). BAD_PIN allows a retry and NO_PIN surfaces the setup CTA
// (both handled inside PinDialog); FORBIDDEN / DECRYPT_FAILED render inline
// without a retry prompt, since re-entering the PIN cannot fix a
// hidden-by-role or corrupt row.
//
// FIX4: the eye button renders ONLY when canReveal is true — a role that can't
// view the field never sees a dead-end reveal control.
//
// MOUNT SIDE-EFFECT NOTE: in the grid both the table and card instances of
// this component are mounted at once (one is CSS-hidden). Per-instance reveal
// state is safe ONLY because this component has NO mount-time side effect (no
// autofocus, no auto-open of the dialog). Keep it that way — adding one would
// fire in the hidden instance too.
export default function SecretField({
  maskedValue,
  employeeId,
  field,
  label,
  canReveal,
}: {
  maskedValue: string;
  employeeId: string;
  field: SecretFieldKey;
  label: string;
  canReveal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function onConfirm(pin: string): Promise<PinConfirmResult> {
    const res = await revealField(pin, employeeId, field);
    if (res.ok) {
      setRevealed(res.value);
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
        <span>{revealed !== null ? revealed || "—" : maskedValue}</span>
        {canReveal && (
          <button
            type="button"
            onClick={toggle}
            aria-label={revealed !== null ? `Hide ${label}` : `Reveal ${label}`}
            title={revealed !== null ? `Hide ${label}` : `Reveal ${label}`}
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
        )}
      </span>
      <PinDialog
        open={open}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        title={`Reveal ${label}`}
        description={`Enter your security PIN to view the full ${label}.`}
      />
    </>
  );
}
