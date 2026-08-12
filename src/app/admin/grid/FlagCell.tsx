"use client";

import { setEmployeeFlag } from "../actions";

// Inline yes/no (tri-state) cell for boolean columns. Saves on change.
export default function FlagCell({
  id,
  column,
  value,
}: {
  id: string;
  column: string;
  value: boolean | null;
}) {
  return (
    <form action={setEmployeeFlag}>
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="column" value={column} />
      <select
        name="value"
        defaultValue={value === true ? "true" : value === false ? "false" : ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </form>
  );
}
