import { prisma } from "./prisma";

// The 9 application roles.
export const ROLES = [
  "EMPLOYEE",
  "TRACKS",
  "HR",
  "ACCOUNT_MANAGER",
  "PROJECT_LEAD",
  "PROJECT_MANAGER",
  "SAFETY",
  "ADMIN",
  "SUPER_ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  TRACKS: "Tracks",
  HR: "HR",
  ACCOUNT_MANAGER: "Account Manager",
  PROJECT_LEAD: "Project Lead",
  PROJECT_MANAGER: "Project Manager",
  SAFETY: "Safety",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

// Roles that can manage users and the access matrix.
export const ADMIN_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];
export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as Role);
}

// Logical columns shown in the data grid. These keys drive access control.
export const COLUMNS = [
  { key: "name", label: "Employee" },
  { key: "site", label: "Site" },
  { key: "active", label: "Status" },
  { key: "address", label: "Address" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "ssn", label: "SS#" },
  { key: "driverLicense", label: "Driver License" },
  { key: "safetyExpiry", label: "Safety Expiry" },
  { key: "twicExpiry", label: "TWIC Expiry" },
  { key: "certification", label: "Certification" },
  { key: "utilityBill", label: "Utility Bill" },
  { key: "payRate", label: "Pay Rate" },
  { key: "billRate", label: "Bill Rate" },
  { key: "hireDate", label: "Hire Date" },
  { key: "frc", label: "FRC" },
  { key: "creditCard", label: "Credit Card" },
  { key: "emailNeeded", label: "Email Needed" },
  { key: "approved", label: "Approved" },
  // Not a grid column: gates who can open an employee's document library page
  // (full PII + all uploaded documents). View or Edit = may open; Hidden = blocked.
  { key: "library", label: "Employee Library" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];
export const COLUMN_KEYS = COLUMNS.map((c) => c.key);

export const LEVELS = ["HIDDEN", "VIEW", "EDIT"] as const;
export type Level = (typeof LEVELS)[number];

export type ColumnAccess = { level: Level; canApprove: boolean };
export type AccessMap = Record<string, ColumnAccess>;

// Sensible starting defaults per role (Admin can change these in the UI).
export function defaultAccess(role: Role, columnKey: string): ColumnAccess {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return { level: "EDIT", canApprove: true };
  }
  // Library is locked down by default: only HR (and admins above) may open the
  // full employee document library. Admins can grant other roles in the matrix.
  if (columnKey === "library") {
    return { level: role === "HR" ? "VIEW" : "HIDDEN", canApprove: false };
  }
  switch (role) {
    case "PROJECT_LEAD":
      if (
        [
          "site",
          "active",
          "payRate",
          "billRate",
          "hireDate",
          "frc",
          "creditCard",
          "emailNeeded",
        ].includes(columnKey)
      )
        return { level: "EDIT", canApprove: columnKey === "payRate" || columnKey === "billRate" };
      return { level: "VIEW", canApprove: false };
    case "SAFETY":
      if (["safetyExpiry", "twicExpiry"].includes(columnKey))
        return { level: "EDIT", canApprove: true };
      return { level: "VIEW", canApprove: false };
    case "HR":
      if (
        ["email", "phone", "address", "ssn", "driverLicense", "utilityBill", "approved"].includes(
          columnKey,
        )
      )
        return { level: "EDIT", canApprove: columnKey !== "approved" };
      return { level: "VIEW", canApprove: false };
    case "ACCOUNT_MANAGER":
      if (columnKey === "ssn") return { level: "HIDDEN", canApprove: false };
      return { level: "VIEW", canApprove: false };
    case "TRACKS":
      if (["ssn", "payRate", "billRate"].includes(columnKey))
        return { level: "HIDDEN", canApprove: false };
      return { level: "VIEW", canApprove: false };
    case "EMPLOYEE":
    default:
      if (columnKey === "name") return { level: "VIEW", canApprove: false };
      return { level: "HIDDEN", canApprove: false };
  }
}

// Resolve the effective access map for a role from the DB, falling back to defaults.
export async function getAccessMap(role: string): Promise<AccessMap> {
  if (role === "SUPER_ADMIN") {
    return Object.fromEntries(
      COLUMN_KEYS.map((k) => [k, { level: "EDIT" as Level, canApprove: true }]),
    );
  }
  const rows = await prisma.columnAccess.findMany({ where: { role } });
  const byKey = new Map(rows.map((r) => [r.columnKey, r]));
  const map: AccessMap = {};
  for (const key of COLUMN_KEYS) {
    const row = byKey.get(key);
    if (row) {
      map[key] = { level: row.level as Level, canApprove: row.canApprove };
    } else {
      map[key] = defaultAccess(role as Role, key);
    }
  }
  return map;
}

export function canView(a: AccessMap, key: string): boolean {
  return a[key]?.level !== "HIDDEN";
}
export function canEdit(a: AccessMap, key: string): boolean {
  return a[key]?.level === "EDIT";
}
export function canApprove(a: AccessMap, key: string): boolean {
  return !!a[key]?.canApprove;
}
