export const DOCUMENT_CATEGORIES = [
  { key: "LICENSE", label: "Driver's License" },
  { key: "SSN", label: "Social Security Card" },
  { key: "TWIC", label: "TWIC Card" },
  { key: "SAFETY_COUNCIL", label: "Safety Council Card" },
  { key: "CERTIFICATION", label: "Certification(s)" },
  { key: "UTILITY_BILL", label: "Utility Bill" },
  { key: "OTHER", label: "Other" },
] as const;

export type DocumentCategoryKey = (typeof DOCUMENT_CATEGORIES)[number]["key"];

export const EMPLOYEE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "HR_REVIEW",
  "RATES_ASSIGNED",
  "APPROVED",
] as const;

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];
