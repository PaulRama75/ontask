export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AM_APPROVED: "AM Approved",
  ADMIN_APPROVED: "Admin Approved (sending)",
  SENT: "Sent",
};

export const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-white/5 text-slate-300",
  SUBMITTED: "bg-amber-500/15 text-amber-300",
  AM_APPROVED: "bg-blue-500/15 text-blue-300",
  ADMIN_APPROVED: "bg-blue-500/15 text-blue-300",
  SENT: "bg-emerald-500/15 text-emerald-300",
};
