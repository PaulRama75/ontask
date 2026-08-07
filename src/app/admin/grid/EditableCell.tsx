"use client";

import { setEmployeeField } from "../actions";

// Generic inline-editable single-value cell. Saves on blur or Enter.
export default function EditableCell({
  id,
  column,
  value,
  type = "text",
  width = "w-32",
}: {
  id: string;
  column: string;
  value: string | null;
  type?: "text" | "date" | "email" | "tel";
  width?: string;
}) {
  return (
    <form action={setEmployeeField}>
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="column" value={column} />
      <input
        name="value"
        type={type}
        defaultValue={value ?? ""}
        placeholder="—"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={`${width} rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none`}
      />
    </form>
  );
}
