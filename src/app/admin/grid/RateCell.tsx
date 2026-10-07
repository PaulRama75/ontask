"use client";

import { setRate } from "../actions";
import CurrencyInput from "../CurrencyInput";
import PinConfirmButton from "../PinConfirmButton";

// Inline-editable pay/bill rate shown as currency. Setting a rate is a
// PIN-gated action, so the value is entered inline then committed via the
// shared PinConfirmButton (which collects the PIN and invokes setRate).
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
    <PinConfirmButton
      action={setRate}
      fields={{ employeeId: id, field }}
      inputs={
        <CurrencyInput
          name="value"
          defaultValue={value}
          className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
        />
      }
      confirmMessage={`Update the ${field === "payRate" ? "pay" : "bill"} rate?`}
      className="text-xs text-cyan-400 hover:underline"
    >
      Save
    </PinConfirmButton>
  );
}
