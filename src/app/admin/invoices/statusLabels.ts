export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AM_APPROVED: "AM Approved",
  ADMIN_APPROVED: "Admin Approved (sending)",
  SENT: "Sent",
};

export const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-amber-100 text-amber-700",
  AM_APPROVED: "bg-blue-100 text-blue-700",
  ADMIN_APPROVED: "bg-blue-100 text-blue-700",
  SENT: "bg-green-100 text-green-700",
};
