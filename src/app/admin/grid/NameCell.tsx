"use client";

import Link from "next/link";
import { setEmployeeField } from "../actions";

// Inline-editable first/last name pair, with a link to the employee library.
export default function NameCell({
  id,
  firstName,
  lastName,
  canOpenLibrary = true,
}: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  canOpenLibrary?: boolean;
}) {
  const submit = (el: HTMLInputElement) => el.form?.requestSubmit();
  return (
    <div className="flex flex-col gap-1">
      <form action={setEmployeeField} className="flex gap-1">
        <input type="hidden" name="employeeId" value={id} />
        <input type="hidden" name="column" value="name" />
        <input
          name="firstName"
          defaultValue={firstName ?? ""}
          placeholder="First"
          onBlur={(e) => submit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
        />
        <input
          name="lastName"
          defaultValue={lastName ?? ""}
          placeholder="Last"
          onBlur={(e) => submit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none"
        />
      </form>
      {canOpenLibrary && (
        <Link href={`/admin/employee/${id}`} className="text-xs text-cyan-400 hover:underline">
          Open details →
        </Link>
      )}
    </div>
  );
}
