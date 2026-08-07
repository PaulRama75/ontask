"use client";

import { useRef } from "react";
import { addEmployeeDocument } from "../actions";

// Inline file attachment for a document column. Submits as soon as a file is
// chosen; the server action validates type/size and creates the Document row.
export default function UploadCell({ id, column }: { id: string; column: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={addEmployeeDocument} ref={formRef} className="mt-1">
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="column" value={column} />
      <label className="cursor-pointer text-xs text-gray-500 hover:text-blue-600 hover:underline">
        + Attach
        <input
          type="file"
          name="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
    </form>
  );
}
