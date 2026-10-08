"use client";

import SecretField from "./SecretField";

// Compatibility shim: the SSN display field is now the generalized
// SecretField. Existing callers that pass { maskedSsn, employeeId } keep
// working; FEAT-002 migrates them to SecretField directly. SSN is always
// revealable here because the call sites only render it inside the per-field
// canView("ssn") guard, same as before this field became reusable.
export default function SsnField({
  maskedSsn,
  employeeId,
}: {
  maskedSsn: string;
  employeeId: string;
}) {
  return (
    <SecretField
      maskedValue={maskedSsn}
      employeeId={employeeId}
      field="ssn"
      label="SSN"
      canReveal
    />
  );
}
