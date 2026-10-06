"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  total: number;
  counts: { update: number; new: number; unchanged: number; skip: number };
  updates: { row: number; name: string; email: string | null; changes: { field: string; from: string; to: string }[] }[];
  newRows: { row: number; name: string; email: string | null; site: string | null; hireDate: string | null }[];
  issues: { row: number; name: string; message: string }[];
};

// Bulk-load employees from the template spreadsheet. Rows whose email matches
// an existing employee update that employee's Data Grid fields instead of
// adding them again; everyone else is added as a previous employee (Approved,
// no onboarding link, no emails). Two steps: Preview (saves nothing) then Apply.
export default function ImportEmployees() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [doUpdate, setDoUpdate] = useState(true);
  const [doCreate, setDoCreate] = useState(true);
  const [allowNameMatches, setAllowNameMatches] = useState(false);
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
      fd.append("update", doUpdate ? "1" : "0");
      fd.append("create", doCreate ? "1" : "0");
      if (allowNameMatches) fd.append("allowNameMatches", "1");
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
        const parts = [
          `Updated ${json.updated} employee${json.updated === 1 ? "" : "s"}`,
          `added ${json.created} new`,
          json.unchanged ? `${json.unchanged} already up to date` : null,
          json.skipped ? `${json.skipped} skipped` : null,
        ].filter(Boolean);
        setDone(parts.join(", ") + ".");
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const willApply = preview ? (doUpdate ? preview.counts.update : 0) + (doCreate ? preview.counts.new : 0) : 0;
  const btn = "rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
  const option = (label: string, checked: boolean, set: (v: boolean) => void, resets = false) => (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          set(e.target.checked);
          if (resets) setPreview(null);
        }}
      />
      {label}
    </label>
  );

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Import / update employees from Excel</h2>
          <p className="mt-1 text-xs text-slate-400">
            Rows are matched to existing employees by <strong>email</strong>. A match updates that employee&apos;s Data
            Grid fields (blank cells are left alone) instead of adding them twice. Everyone else is added as a previous
            employee: Approved, no onboarding link, no emails.
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
        <button type="button" disabled={busy} onClick={() => send("preview")} className={`${btn} bg-slate-600 hover:bg-slate-500`}>
          {busy && !preview ? "Checking…" : "Preview"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {option("Update existing employees", doUpdate, setDoUpdate)}
        {option("Add new employees", doCreate, setDoCreate)}
        {option("Also add people whose name is already on file under a different email", allowNameMatches, setAllowNameMatches, true)}
      </div>

      {error && <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      {done && <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{done}</p>}

      {preview && (
        <div className="mt-4 space-y-4 text-sm">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-cyan-300">{preview.counts.update} to update</span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">{preview.counts.new} new</span>
            <span className="rounded-full bg-slate-500/20 px-3 py-1 text-slate-300">{preview.counts.unchanged} already up to date</span>
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-300">{preview.counts.skip} skipped</span>
            <span className="px-1 py-1 text-slate-500">of {preview.total} rows</span>
          </div>

          {preview.updates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-400">Updates</h3>
              <ul className="mt-1 max-h-60 space-y-2 overflow-y-auto rounded-md border border-white/10 bg-slate-950/40 p-2 text-xs">
                {preview.updates.map((u) => (
                  <li key={u.row}>
                    <span className="text-slate-500">Row {u.row}</span>{" "}
                    <span className="font-medium text-slate-200">{u.name}</span>{" "}
                    <span className="text-slate-500">({u.email})</span>
                    <ul className="ml-4 mt-0.5 text-slate-300">
                      {u.changes.map((c) => (
                        <li key={c.field}>
                          {c.field}: <span className="text-slate-500 line-through">{c.from}</span> → <span className="text-cyan-300">{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {preview.counts.update > preview.updates.length && (
                <p className="mt-1 text-xs text-slate-500">…and {preview.counts.update - preview.updates.length} more.</p>
              )}
            </div>
          )}

          {preview.newRows.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-400">New employees</h3>
              <table className="mt-1 w-full text-left text-xs">
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
                  {preview.newRows.map((s) => (
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
              {preview.counts.new > preview.newRows.length && (
                <p className="mt-1 text-xs text-slate-500">…and {preview.counts.new - preview.newRows.length} more.</p>
              )}
            </div>
          )}

          {preview.issues.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400">Skipped</h3>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-white/10 bg-slate-950/40 p-2 text-xs text-amber-300">
                {preview.issues.map((i) => (
                  <li key={`${i.row}-${i.message}`}>
                    Row {i.row} ({i.name}): {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled={busy || willApply === 0}
            onClick={() => send("import")}
            className={`${btn} bg-blue-600 hover:bg-blue-500`}
          >
            {busy
              ? "Saving…"
              : `Apply: ${doUpdate ? `update ${preview.counts.update}` : "no updates"}, ${doCreate ? `add ${preview.counts.new}` : "no new"}`}
          </button>
        </div>
      )}
    </section>
  );
}
