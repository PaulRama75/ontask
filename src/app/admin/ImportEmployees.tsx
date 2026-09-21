"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  total: number;
  willImport: number;
  invalid: number;
  duplicates: number;
  sample: { row: number; name: string; email: string | null; site: string | null; hireDate: string | null }[];
  issues: { row: number; name: string; message: string }[];
};

// Bulk-add previous employees from a spreadsheet, skipping onboarding. Two
// steps: Preview (validates, saves nothing) then Import.
export default function ImportEmployees() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
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
      if (allowDuplicates) fd.append("allowDuplicates", "1");
      const res = await fetch("/api/employee-import", { method: "POST", body: fd });
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
        const skipped = json.skippedInvalid + json.skippedDuplicates;
        setDone(`Imported ${json.imported} employee${json.imported === 1 ? "" : "s"}${skipped ? `; skipped ${skipped}` : ""}.`);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Import previous employees</h2>
          <p className="mt-1 text-xs text-slate-400">
            Add existing employees from a spreadsheet without sending onboarding links. They are created as Approved and no emails are sent.
          </p>
        </div>
        <a href="/api/employee-import/template" className="shrink-0 text-sm text-cyan-400 hover:underline">
          Download template
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={() => {
            setPreview(null);
            setError(null);
            setDone(null);
          }}
          className="text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-slate-600"
        />
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={allowDuplicates}
            onChange={(e) => {
              setAllowDuplicates(e.target.checked);
              setPreview(null);
            }}
          />
          Also import rows that look like duplicates
        </label>
        <button type="button" disabled={busy} onClick={() => send("preview")} className={`${btn} bg-slate-600 hover:bg-slate-500`}>
          {busy && !preview ? "Checking…" : "Preview"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      {done && <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{done}</p>}

      {preview && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-slate-300">
            {preview.total} row{preview.total === 1 ? "" : "s"} found:{" "}
            <span className="text-emerald-300">{preview.willImport} ready to import</span>
            {preview.duplicates > 0 && !allowDuplicates && <span className="text-amber-300">, {preview.duplicates} duplicate{preview.duplicates === 1 ? "" : "s"} skipped</span>}
            {preview.invalid > 0 && <span className="text-rose-300">, {preview.invalid} with errors skipped</span>}.
          </p>
          {preview.sample.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3">Row</th>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Email</th>
                  <th className="py-1 pr-3">Site</th>
                  <th className="py-1">Hire date</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {preview.sample.map((s) => (
                  <tr key={s.row} className="border-t border-white/5">
                    <td className="py-1 pr-3 text-slate-500">{s.row}</td>
                    <td className="py-1 pr-3">{s.name}</td>
                    <td className="py-1 pr-3">{s.email ?? "—"}</td>
                    <td className="py-1 pr-3">{s.site ?? "—"}</td>
                    <td className="py-1">{s.hireDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.willImport > preview.sample.length && (
            <p className="text-xs text-slate-500">…and {preview.willImport - preview.sample.length} more.</p>
          )}
          {preview.issues.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-white/10 bg-slate-950/40 p-2 text-xs text-amber-300">
              {preview.issues.map((i) => (
                <li key={`${i.row}-${i.message}`}>
                  Row {i.row} ({i.name}): {i.message}
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
            {busy ? "Importing…" : `Import ${preview.willImport} employee${preview.willImport === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </section>
  );
}
