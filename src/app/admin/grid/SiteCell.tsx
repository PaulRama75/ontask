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
        className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-white/10 focus:border-sky-400/60 focus:bg-[#0a1426] focus:outline-none"
      />
    </form>
  );
}
