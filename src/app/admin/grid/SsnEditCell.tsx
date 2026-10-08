"use client";

import SecretEditCell from "./SecretEditCell";

// Compatibility shim: the editable SSN grid cell is now the generalized
// SecretEditCell. Existing callers that pass { employeeId, ssnMasked } keep
// working; FEAT-002 migrates them to SecretEditCell directly. SSN is always
// revealable here because the grid only renders this cell inside the
// per-field canView("ssn") guard, same as before this cell became reusable.
export default function SsnEditCell({
  employeeId,
  ssnMasked,
}: {
  employeeId: string;
  ssnMasked: string;
}) {
  return (
    <SecretEditCell
      employeeId={employeeId}
      maskedValue={ssnMasked}
      field="ssn"
      label="SSN"
      canReveal
    />
  );
}
