"use client";

import { setFrc } from "../actions";

// Inline FRC cell: a yes/no need toggle plus a size field. Both submit together.
export default function FrcCell({
  id,
  needed,
  size,
}: {
  id: string;
  needed: boolean | null;
  size: string | null;
}) {
  return (
    <form action={setFrc} className="flex items-center gap-1">
      <input type="hidden" name="employeeId" value={id} />
      <select
        name="needed"
        defaultValue={needed === true ? "true" : needed === false ? "false" : ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <input
        name="size"
        defaultValue={size ?? ""}
        placeholder="Size"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
      />
    </form>
  );
}
