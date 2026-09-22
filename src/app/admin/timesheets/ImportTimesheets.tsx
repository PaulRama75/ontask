"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  total: number;
  willImport: number;
  invalid: number;
  sample: { row: number; email: string | null; date: string | null; jobNumber: string | null; stHours: number | null }[];
  issues: { row: number; email: string | null; message: string }[];
};

export default function ImportTimesheets() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(mode: "preview" | "import") {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an .xlsx or .csv file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/timesheet-import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed.");
        setPreview(null);
        return;
      }
      if (mode === "preview") {
        setPreview(json);
      } else {
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        setDone(`Imported ${json.imported} row${json.imported === 1 ? "" : "s"}${json.skipped ? `; skipped ${json.skipped}` : ""}.`);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
  return (
    <details className="mt-4 rounded-md border border-white/10 bg-slate-950/40 p-3">
      <summary className="cursor-pointer text-sm text-cyan-400">Import timesheets from a spreadsheet</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/timesheet-import/template" className="text-xs text-cyan-400 hover:underline">
            Download template
          </a>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={() => {
              setPreview(null);
              setError(null);
              setDone(null);
            }}
            className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white hover:file:bg-slate-600"
          />
          <button type="button" disabled={busy} onClick={() => send("preview")} className={`${btn} bg-slate-600 hover:bg-slate-500`}>
            {busy && !preview ? "Checking…" : "Preview"}
          </button>
        </div>

        {error && <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">{error}</p>}
        {done && <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{done}</p>}

        {preview && (
          <div className="space-y-2 text-xs">
            <p className="text-slate-300">
              {preview.total} row{preview.total === 1 ? "" : "s"}:{" "}
              <span className="text-emerald-300">{preview.willImport} ready</span>
              {preview.invalid > 0 && <span className="text-rose-300">, {preview.invalid} with errors skipped</span>}.
            </p>
            {preview.issues.length > 0 && (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-white/10 bg-slate-950/40 p-2 text-amber-300">
                {preview.issues.map((i) => (
                  <li key={`${i.row}-${i.message}`}>
                    Row {i.row} ({i.email}): {i.message}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={busy || preview.willImport === 0}
              onClick={() => send("import")}
              className={`${btn} bg-blue-600 hover:bg-blue-500`}
            >
              {busy ? "Importing…" : `Import ${preview.willImport} row${preview.willImport === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
