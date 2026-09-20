"use client";

import { setRate } from "../actions";
import CurrencyInput from "../CurrencyInput";

// Inline-editable pay/bill rate shown as currency. Saves on blur or Enter via
// the server action.
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
      <CurrencyInput
        name="value"
        defaultValue={value}
        autoSubmit
        className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
      />
    </form>
  );
}
