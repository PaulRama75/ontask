"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PinDialog, { type PinConfirmResult } from "./PinDialog";
import { verifyPinForUnlock } from "./pin/actions";
import type { UnlockScope } from "@/lib/pinGate";

// Drop-in replacement for a bare download <a href> pointing at a PIN-gated
// GET route. On click it opens the shared PinDialog, verifies the PIN (which
// mints the scoped single-use unlock cookie), then triggers the plain GET so
// the fresh cookie rides along. A NO_PIN result routes to /admin/profile#pin;
// a BAD_PIN result keeps the dialog open for a retry.
export default function PinUnlockLink({
  href,
  scope,
  children,
  className,
  title,
}: {
  href: string;
  scope: UnlockScope;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function onConfirm(pin: string): Promise<PinConfirmResult> {
    const res = await verifyPinForUnlock(pin, scope);
    if (res.ok) {
      setOpen(false);
      // "file" scope opens inline in a new tab; "export" downloads in place.
      if (scope === "file") {
        window.open(href, "_blank");
      } else {
        window.location.assign(href);
      }
      return { ok: true };
    }
    if (res.code === "NO_PIN") {
      setOpen(false);
      router.push("/admin/profile#pin");
      return { ok: false, pinRequired: true };
    }
    return { ok: false, error: res.error };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title={title}
      >
        {children}
      </button>
      <PinDialog
        open={open}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        title="Enter your security PIN"
        description="This download is protected. Enter your PIN to continue."
      />
    </>
  );
}
