"use client";

import { useRef } from "react";
import { addEmployeeDocument } from "../actions";

// Inline file attachment for a document column. Submits as soon as a file is
// chosen; the server action validates type/size and creates the Document row.
// For the certification column, an optional title (e.g. "OSHA 10") is stored
// on Document.label so the grid can show which cert a file belongs to without
// opening it.
export default function UploadCell({
  id,
  column,
  certNames,
}: {
  id: string;
  column: string;
  certNames?: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const datalistId = `certnames-${id}`;

  return (
    <form action={addEmployeeDocument} ref={formRef} className="mt-1 space-y-1">
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="column" value={column} />
      {column === "certification" && (
        <>
          <input
            ref={labelRef}
            name="label"
            list={datalistId}
            placeholder="Title (e.g. OSHA 10)"
            className="w-full rounded border border-white/10 bg-slate-800/60 px-1.5 py-0.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
          />
          {certNames && certNames.length > 0 && (
            <datalist id={datalistId}>
              {certNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
        </>
      )}
      <label className="cursor-pointer text-xs text-slate-400 hover:text-cyan-400 hover:underline">
        + Attach
        <input
          type="file"
          name="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
    </form>
  );
}
