"use client";

import { setSite } from "../actions";

// Inline-editable job site. Saves on blur or Enter via the server action.
export default function SiteCell({ id, site }: { id: string; site: string | null }) {
  return (
    <form action={setSite}>
      <input type="hidden" name="employeeId" value={id} />
      <input
        name="site"
        defaultValue={site ?? ""}
        placeholder="—"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none"
      />
    </form>
  );
}
