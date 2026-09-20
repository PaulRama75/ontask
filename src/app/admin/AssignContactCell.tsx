"use client";

import { assignProjectContact } from "./actions";

type Option = { email: string; name: string | null };

// Project Lead / Project Manager picker for one employee. Saves as soon as a
// choice is made; the empty option clears the assignment.
export default function AssignContactCell({
  employeeId,
  kind,
  current,
  options,
}: {
  employeeId: string;
  kind: "PL" | "PM";
  current: string | null;
  options: Option[];
}) {
  // Keep an already-assigned person selectable even if they're no longer an
  // active user of that role (e.g. role changed or account disabled).
  const known = current ? options.some((o) => o.email.toLowerCase() === current.toLowerCase()) : true;
  return (
    <form action={assignProjectContact}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="kind" value={kind} />
      <select
        name="email"
        defaultValue={current ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={kind === "PL" ? "Project Lead" : "Project Manager"}
        className={`max-w-[11rem] rounded border bg-slate-800/60 px-1.5 py-1 text-xs focus:border-cyan-400 focus:outline-none ${
          current ? "border-white/10 text-white" : "border-amber-500/40 text-amber-300"
        }`}
      >
        <option value="">{kind === "PL" ? "Assign Lead…" : "Assign Manager…"}</option>
        {!known && current && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o.email} value={o.email}>
            {o.name || o.email}
          </option>
        ))}
      </select>
    </form>
  );
}
