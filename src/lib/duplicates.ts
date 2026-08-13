// Flags employees that share an email or full name with another employee
// record — the two most common ways an onboarding link gets created twice
// for the same person. Matching is case-insensitive/trimmed; blank
// email/name never counts as a match.
export function findDuplicateEmployeeIds(
  employees: { id: string; firstName: string | null; lastName: string | null; email: string | null }[],
): Set<string> {
  const byEmail = new Map<string, string[]>();
  const byName = new Map<string, string[]>();

  for (const e of employees) {
    const email = e.email?.trim().toLowerCase();
    if (email) {
      const ids = byEmail.get(email) ?? [];
      ids.push(e.id);
      byEmail.set(email, ids);
    }
    const name = [e.firstName, e.lastName].filter(Boolean).join(" ").trim().toLowerCase();
    if (name) {
      const ids = byName.get(name) ?? [];
      ids.push(e.id);
      byName.set(name, ids);
    }
  }

  const duplicateIds = new Set<string>();
  for (const ids of byEmail.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id));
  }
  for (const ids of byName.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id));
  }
  return duplicateIds;
}
