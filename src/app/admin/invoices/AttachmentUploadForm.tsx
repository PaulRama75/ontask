"use client";

import { useRef } from "react";

// Category select + file input + Upload button, with a "Take photo" button
// that reconfigures the SAME file input to open the device camera directly
// (mobile only — desktop browsers just ignore the capture attribute and it
// behaves like a normal file picker). Kept as one shared input (rather than
// two inputs both named "file") so FormData only ever sees one selection.
export default function AttachmentUploadForm({
  invoiceId,
  action,
}: {
  invoiceId: string;
  action: (form: FormData) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function openCamera() {
    const input = fileRef.current;
    if (!input) return;
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.click();
  }

  // Reset back to the default (non-camera) picker after any selection, so a
  // later plain click on the input behaves normally again.
  function resetAccept() {
    const input = fileRef.current;
    if (!input) return;
    input.accept = "application/pdf,image/*";
    input.removeAttribute("capture");
  }

  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <select
        name="category"
        className="rounded-md border border-white/10 bg-slate-800/60 px-2 py-2 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400"
      >
        <option value="TIMESHEET">Timesheet</option>
        <option value="OTHER">Other</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        name="file"
        accept="application/pdf,image/*"
        required
        onChange={resetAccept}
        className="text-sm text-slate-300"
      />
      <button
        type="button"
        onClick={openCamera}
        className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
      >
        📷 Take photo
      </button>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Upload
      </button>
    </form>
  );
}
