"use client";

import { setEmployeeField } from "../actions";

type Addr = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

// Inline-editable multi-field address. Any field's blur/Enter saves the whole set.
export default function AddressCell({ id, addr }: { id: string; addr: Addr }) {
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) =>
    e.currentTarget.form?.requestSubmit();
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  const cls =
    "rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-white/10 focus:border-cyan-400 focus:bg-slate-800 focus:outline-none";

  return (
    <form action={setEmployeeField} className="flex flex-col gap-1">
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="column" value="address" />
      <input
        name="addressLine1"
        defaultValue={addr.addressLine1 ?? ""}
        placeholder="Address line 1"
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`w-48 ${cls}`}
      />
      <input
        name="addressLine2"
        defaultValue={addr.addressLine2 ?? ""}
        placeholder="Address line 2"
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`w-48 ${cls}`}
      />
      <div className="flex gap-1">
        <input
          name="city"
          defaultValue={addr.city ?? ""}
          placeholder="City"
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={`w-24 ${cls}`}
        />
        <input
          name="state"
          defaultValue={addr.state ?? ""}
          placeholder="ST"
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={`w-10 ${cls}`}
        />
        <input
          name="zip"
          defaultValue={addr.zip ?? ""}
          placeholder="ZIP"
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={`w-16 ${cls}`}
        />
      </div>
    </form>
  );
}
