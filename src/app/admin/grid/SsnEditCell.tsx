"use client";

import { useRef, useState } from "react";
import PinDialog, { type PinConfirmResult } from "../PinDialog";
import { setEmployeeSsn } from "../actions";
import { revealSsn } from "../pin/actions";

// Dedicated editable SSN grid cell (design §3.4, Rules 2 & 4). It is passed
// ONLY the server-computed masked value and the employeeId — never the raw or
// ciphertext SSN. The input always starts EMPTY: an empty save is a no-op
// (leaves the stored SSN unchanged); a non-empty save encrypts via the
// PIN-gated setEmployeeSsn; a separate "Clear" nulls the SSN (also PIN-gated).
// Revealing the stored value uses the same revealSsn round-trip as the detail
// page — never the input default. Every write/reveal goes through PinDialog.
type Pending = { kind: "save" } | { kind: "clear" } | { kind: "reveal" } | null;

export default function SsnEditCell({
  employeeId,
  ssnMasked,
}: {
  employeeId: string;
  ssnMasked: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function onConfirm(pin: string): Promise<PinConfirmResult> {
    if (pending?.kind === "reveal") {
      const res = await revealSsn(pin, employeeId);
      if (res.ok) {
        setRevealed(res.ssn);
        setPending(null);
        return { ok: true };
      }
      if (res.code === "NO_PIN") return { ok: false, pinRequired: true };
      return { ok: false, error: res.error };
    }

    // save or clear → setEmployeeSsn
    const form = new FormData();
    form.set("employeeId", employeeId);
    form.set("pin", pin);
    if (pending?.kind === "clear") {
      form.set("clear", "1");
    } else {
      form.set("value", inputRef.current?.value ?? "");
    }
    const res = await setEmployeeSsn(form);
    if (res.ok) {
      if (pending?.kind === "clear") setRevealed(null);
      if (inputRef.current) inputRef.current.value = "";
      setPending(null);
      return { ok: true };
    }
    if (res.pinRequired) return { ok: false, pinRequired: true };
    return { ok: false, error: res.error };
  }

  function toggleReveal() {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    setPending({ kind: "reveal" });
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-slate-300">
        {revealed !== null ? revealed || "—" : ssnMasked}
      </span>
      <button
        type="button"
        onClick={toggleReveal}
        aria-label={revealed !== null ? "Hide SSN" : "Reveal SSN"}
        title={revealed !== null ? "Hide SSN" : "Reveal SSN"}
        className="text-slate-400 transition-colors hover:text-cyan-400"
      >
        {revealed !== null ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        name="value"
        defaultValue=""
        placeholder="New SSN"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if ((e.currentTarget.value ?? "").trim() !== "") setPending({ kind: "save" });
          }
        }}
        className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          if ((inputRef.current?.value ?? "").trim() !== "") setPending({ kind: "save" });
        }}
        className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-slate-300 hover:bg-white/5"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setPending({ kind: "clear" })}
        className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/5"
      >
        Clear
      </button>
      <PinDialog
        open={pending !== null}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
        title={pending?.kind === "reveal" ? "Reveal SSN" : "Confirm with your security PIN"}
        description={
          pending?.kind === "reveal"
            ? "Enter your security PIN to view the full Social Security Number."
            : pending?.kind === "clear"
              ? "Enter your security PIN to clear this employee's SSN."
              : "Enter your security PIN to save this employee's SSN."
        }
      />
    </div>
  );
}
