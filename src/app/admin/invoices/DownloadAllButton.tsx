"use client";

import { useState } from "react";
import PinDialog, { type PinConfirmResult } from "../PinDialog";
import { verifyPinForUnlock } from "../pin/actions";

// Bulk invoice-attachment download. Each gated GET consumes exactly ONE
// single-use unlock token, so a single mint cannot authorize many files.
// Chosen approach: collect the PIN once, then loop — re-calling
// verifyPinForUnlock("file") to mint a fresh token immediately before each
// download. The user enters the PIN a single time; integrity is preserved
// because every file still rides its own freshly-minted single-use token.
export default function DownloadAllButton({ attachmentIds }: { attachmentIds: string[] }) {
  const [open, setOpen] = useState(false);

  async function onConfirm(pin: string): Promise<PinConfirmResult> {
    // Verify once up front so a bad/missing PIN is reported before any
    // download fires. mintUnlock here produces the token for the first file.
    const first = await verifyPinForUnlock(pin, "file");
    if (!first.ok) {
      if (first.code === "NO_PIN") return { ok: false, pinRequired: true };
      return { ok: false, error: first.error };
    }
    setOpen(false);

    for (let i = 0; i < attachmentIds.length; i++) {
      // The first token is already minted; mint a fresh one before each
      // subsequent file so every GET consumes its own single-use token.
      if (i > 0) {
        const r = await verifyPinForUnlock(pin, "file");
        if (!r.ok) break; // stop silently; earlier files already downloaded
      }
      const a = document.createElement("a");
      a.href = `/api/invoice-files/${attachmentIds[i]}?dl=1`;
      a.click();
      // Stagger slightly — firing many downloads in the same tick makes some
      // browsers block all but the first as a suspected pop-up flood.
      await new Promise((res) => setTimeout(res, 300));
    }
    return { ok: true };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-cyan-400 hover:underline"
      >
        Download all ({attachmentIds.length})
      </button>
      <PinDialog
        open={open}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        title="Enter your security PIN"
        description={`Download ${attachmentIds.length} protected attachment${attachmentIds.length === 1 ? "" : "s"}. Enter your PIN to continue.`}
      />
    </>
  );
}
