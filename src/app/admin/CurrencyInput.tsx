"use client";

import { useState } from "react";
import { formatCurrency, parseCurrency } from "@/lib/currency";

// Dollar-amount input. Shows "$1,234.50" when not focused and the plain number
// while editing; submits the plain number under `name`.
export default function CurrencyInput({
  name,
  defaultValue,
  className,
  autoSubmit = false,
}: {
  name: string;
  defaultValue: number | null;
  className?: string;
  autoSubmit?: boolean;
}) {
  const [value, setValue] = useState<number | null>(defaultValue);
  const [text, setText] = useState(defaultValue == null ? "" : formatCurrency(defaultValue));
  const [editing, setEditing] = useState(false);

  return (
    <>
      <input type="hidden" name={name} value={value ?? ""} />
      <input
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={text}
        className={className}
        onFocus={() => {
          setEditing(true);
          setText(value == null ? "" : String(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          setValue(parseCurrency(e.target.value));
        }}
        onBlur={(e) => {
          setEditing(false);
          const n = parseCurrency(text);
          setValue(n);
          setText(n == null ? "" : formatCurrency(n));
          if (autoSubmit) {
            const form = e.currentTarget.form;
            // Let state flush to the hidden input before submitting.
            setTimeout(() => form?.requestSubmit(), 0);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && autoSubmit) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label={editing ? name : undefined}
      />
    </>
  );
}
