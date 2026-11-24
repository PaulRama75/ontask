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
        className={`h-7 w-[11rem] max-w-[11rem] truncate rounded-md border bg-[#0a1426] px-2 text-xs focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40 ${
          current ? "border-white/10 text-white" : "border-amber-500/40 bg-amber-500/[0.06] text-amber-300"
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
