"use client";

import { setRate } from "../actions";

// Inline-editable pay/bill rate. Saves on blur or Enter via the server action.
export default function RateCell({
  id,
  field,
  value,
}: {
  id: string;
  field: "payRate" | "billRate";
  value: number | null;
}) {
  return (
    <form action={setRate}>
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="field" value={field} />
      <input
        name="value"
        type="number"
        step="0.01"
        min="0"
        defaultValue={value ?? ""}
        placeholder="—"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
      />
    </form>
  );
}
