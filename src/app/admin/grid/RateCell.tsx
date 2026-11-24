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
          className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-white/10 focus:border-sky-400/60 focus:bg-[#0a1426] focus:outline-none"
        />
      }
      confirmMessage={`Update the ${field === "payRate" ? "pay" : "bill"} rate?`}
      className="text-xs text-sky-300 hover:text-sky-200 hover:underline"
    >
      Save
    </PinConfirmButton>
  );
}
