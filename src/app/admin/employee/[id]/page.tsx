import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import {
  getAccessMap,
  canView,
  canEdit,
  isAdminRole,
  isAssignedProjectLeadOrManager,
  hasEmployeeDocumentGrant,
  getNavAccess,
  getOwnEmployeeId,
} from "@/lib/rbac";
import { saveProjectLeadDetails, grantDocumentAccess, revokeDocumentAccess } from "../../actions";
import DocRow from "./DocRow";
import PinUnlockLink from "../../PinUnlockLink";
import PinConfirmButton from "../../PinConfirmButton";
import SecretField from "../../SecretField";
import { maskSsn, maskLast4, safeDecrypt } from "@/lib/crypto";
import CurrencyInput from "../../CurrencyInput";
import { formatCurrency } from "@/lib/currency";
import { submitStatusChange } from "./status-change/actions";
import { generateTimesheetLink, resendTimesheetLink, revokeTimesheetLink } from "./timesheet-link/actions";

export const dynamic = "force-dynamic";

// Project Lead columns shown in the grouped details form, in display order.
const PL_FIELDS = [
  "site",
  "hireDate",
  "payRate",
  "billRate",
  "frc",
  "creditCard",
  "emailNeeded",
] as const;

// Job-assignment checkbox groups (multi-select, stored as comma-separated strings).
const EMPLOYMENT_TYPE_OPTIONS = ["Full Time", "Part Time", "1099 Employee", "Benefits", "No Benefits"];
// Same choices as the "Reason for Change" dropdown on the HR-FORM-02 Word form.
const STATUS_CHANGE_REASONS = [
  "Rate Increase",
  "Rate Decrease",
  "Benefits",
  "Billing Rate/Code",
  "Involuntary Layoff",
  "Voluntary Layoff",
  "Promotion",
  "Demotion",
  "Site/Job Transfer",
  "Other",
];
const POSITION_TYPE_OPTIONS = ["Administrative", "Field Personnel", "Supervision", "Management"];
const SAFETY_EQUIPMENT_OPTIONS = [
  "N/A",
  "H2S monitor",
  "Four Gas",
  "Harness",
  "Lanyard",
  "Hard Hat",
  "Safety glasses",
  "Gloves",
  "Goggles",
];

function csvToList(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function dateInputValue(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EmployeeLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ travelSent?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { travelSent } = await searchParams;

  const { id } = await params;

  // Access: the full library (PII + documents) requires the "library"
  // permission -- OR being the Project Lead/Manager personally assigned to
  // this specific employee -- OR a one-off Admin-granted share -- in which
  // case they see the same full page too (view/download only for a grant;
  // full edit for an assignment).
  const access = await getAccessMap(me.role);
  const canLib = canView(access, "library") || me.hasFullDocumentAccess;
  const canEditPL = PL_FIELDS.some((k) => canEdit(access, k));
  const isProjectLead = me.role === "PROJECT_LEAD";
  const isProjectManager = me.role === "PROJECT_MANAGER";
  const granted = canLib ? false : await hasEmployeeDocumentGrant(me.id, id);
  if (!canLib && !canEditPL && !isProjectLead && !isProjectManager && !granted) {
    redirect("/admin/grid");
  }
  // An Employee may only ever open their own record.
  if (me.role === "EMPLOYEE" && id !== (await getOwnEmployeeId(me))) {
    redirect("/admin/grid");
  }

  const e = await prisma.employee.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: "asc" } }, certifications: true },
  });
  if (!e) notFound();

  // A Project Lead/Manager without the broad "library" permission may only
  // open employees they were personally assigned to at link creation -- as
  // either the Project Lead or the Project Manager (a person's current role
  // doesn't always match which dropdown they were picked from) -- not every
  // employee in the system, unless they also hold a one-off grant.
  const assignedToMe = isAssignedProjectLeadOrManager(me, e);
  if (!canLib && (isProjectLead || isProjectManager) && !assignedToMe && !granted) {
    redirect("/admin/grid");
  }
  const canFullView = canLib || assignedToMe || granted;
  // A Project Lead/Manager assigned to this employee gets full edit rights
  // on the PL details form for them, same as a Super Admin would -- not
  // just whatever the role-wide Access Control matrix happens to grant. A
  // one-off grant is view/download only and never implies edit rights.
  const canEditThis = canEditPL || assignedToMe;

  // Site-level access: a restricted non-admin can't open employees outside their sites.
  if (!isAdminRole(me.role)) {
    const mine = await prisma.userSite.findMany({
      where: { userId: me.id },
      select: { site: true },
    });
    if (mine.length > 0 && !(e.site && mine.some((s) => s.site === e.site))) {
      redirect("/admin/grid");
    }
  }

  const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || "Unnamed employee";
  const docsByCategory = (cat: string) => e.documents.filter((d) => d.category === cat);

  // Admin-only: manage one-off document-access shares for this employee.
  const isAdmin = isAdminRole(me.role);
  const existingGrants = isAdmin
    ? await prisma.employeeDocumentGrant.findMany({
        where: { employeeId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const grantableUsers = isAdmin
    ? await prisma.user.findMany({
        where: { active: true, id: { notIn: existingGrants.map((g) => g.userId) } },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Status Change is the third step of the onboarding flow, shown once
  // Project Lead Details have been submitted at least once (proxied by
  // either core PL field being set), and only to the same people who can
  // edit those details (assigned PL/PM, or Admin/Super Admin).
  const plDetailsSubmitted = e.site != null || e.hireDate != null;
  const canFileStatusChange = plDetailsSubmitted && (canEditThis || isAdmin);
  const statusChangeHistory = canFileStatusChange
    ? await prisma.statusChangeRequest.findMany({
        where: { employeeId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  // Admins, plus the Project Lead/Manager assigned to this employee, share
  // the employee's timesheet link.
  const canShareTimesheet = isAdmin || assignedToMe;
  const timesheetToken = canShareTimesheet
    ? await prisma.employeeTimesheetToken.findUnique({ where: { employeeId: id } })
    : null;
  const canSeeTimesheetsPage = canShareTimesheet && (await getNavAccess(me.role)).timesheets;
  const timesheetBase = process.env.APP_BASE_URL ?? "http://localhost:3000";

  return (
    <main className="min-h-screen py-3">
      <div className="mx-auto max-w-6xl px-4">
        <section className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-xs font-bold text-white shadow-lg shadow-blue-600/30">
                {initialsOf(name)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-base font-bold tracking-wide text-white">{name}</h1>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusTone(e.status)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {e.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {canFullView ? "Employee profile · Document library" : "Project Lead details"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin" className={chipLinkCls}>
                ← Back to admin
              </Link>
              {(canEditThis || isAdmin) && (
                <Link href={`/admin/employee/${id}/travel`} className={chipLinkCls}>
                  Travel Request →
                </Link>
              )}
            </div>
          </div>
        </section>
        {travelSent === "1" && (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Travel request submitted and emailed to the Travel Administrator.
          </p>
        )}

        {(canFullView || canEditThis) && (
          <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
            <h2 className={h2Cls}>Project Lead Details</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Filled in by the Project Lead after the employee completes onboarding.
            </p>
            {/* key={e.id} forces a full remount when navigating between employees.
                Every field below is uncontrolled (defaultValue/defaultChecked),
                which only applies on mount -- without this key, client-side
                navigation from one employee's page to another can leave a
                leftover Yes/No selection from the previous employee sitting in
                the live DOM and get submitted for this one instead. */}
            <form
              key={e.id}
              action={saveProjectLeadDetails}
              className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4"
            >
              <input type="hidden" name="employeeId" value={e.id} />

              {canView(access, "site") && (
                <PLField label="Site">
                  {(canEdit(access, "site") || canEditThis) ? (
                    <input name="site" defaultValue={e.site ?? ""} className={inputCls} />
                  ) : (
                    <ReadOnly value={e.site} />
                  )}
                </PLField>
              )}

              {canView(access, "hireDate") && (
                <PLField label="Hire Date">
                  {(canEdit(access, "hireDate") || canEditThis) ? (
                    <input type="date" name="hireDate" defaultValue={dateInputValue(e.hireDate)} className={inputCls} />
                  ) : (
                    <ReadOnly value={fmtDate(e.hireDate)} />
                  )}
                </PLField>
              )}

              {canView(access, "payRate") && (
                <PLField label="Pay Rate">
                  {(canEdit(access, "payRate") || canEditThis) ? (
                    <CurrencyInput name="payRate" defaultValue={e.payRate} className={inputCls} />
                  ) : (
                    <ReadOnly value={e.payRate != null ? formatCurrency(e.payRate) : null} />
                  )}
                </PLField>
              )}

              {canView(access, "billRate") && (
                <PLField label="Bill Rate">
                  {(canEdit(access, "billRate") || canEditThis) ? (
                    <CurrencyInput name="billRate" defaultValue={e.billRate} className={inputCls} />
                  ) : (
                    <ReadOnly value={e.billRate != null ? formatCurrency(e.billRate) : null} />
                  )}
                </PLField>
              )}

              {canView(access, "frc") && (
                <PLField label="FRC Needed / Size">
                  {(canEdit(access, "frc") || canEditThis) ? (
                    <div className="flex gap-2">
                      <select name="frcNeeded" defaultValue={triValue(e.frcNeeded)} className={inputCls}>
                        <option value="">—</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                      <input name="frcSize" defaultValue={e.frcSize ?? ""} placeholder="Size" className={inputCls} />
                    </div>
                  ) : (
                    <ReadOnly
                      value={
                        e.frcNeeded == null
                          ? null
                          : e.frcNeeded
                            ? `Yes${e.frcSize ? ` · ${e.frcSize}` : ""}`
                            : "No"
                      }
                    />
                  )}
                </PLField>
              )}

              {canView(access, "creditCard") && (
                <PLField label="Credit Card Approved">
                  {(canEdit(access, "creditCard") || canEditThis) ? (
                    <select name="creditCardApproved" defaultValue={triValue(e.creditCardApproved)} className={inputCls}>
                      <option value="">—</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <ReadOnly value={yesNoText(e.creditCardApproved)} />
                  )}
                </PLField>
              )}

              {canView(access, "emailNeeded") && (
                <PLField label="Email Needed">
                  {(canEdit(access, "emailNeeded") || canEditThis) ? (
                    <select name="emailNeeded" defaultValue={triValue(e.emailNeeded)} className={inputCls}>
                      <option value="">—</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <ReadOnly value={yesNoText(e.emailNeeded)} />
                  )}
                </PLField>
              )}

              {(canEditThis || canFullView) && (
                <>
                  <PLField label="Urgency">
                    {canEditThis ? (
                      <select name="urgency" defaultValue={e.urgency ?? ""} className={inputCls}>
                        <option value="">—</option>
                        <option value="URGENT">Urgent</option>
                        <option value="NON_URGENT">Non-Urgent</option>
                      </select>
                    ) : (
                      <ReadOnly value={e.urgency === "URGENT" ? "Urgent" : e.urgency === "NON_URGENT" ? "Non-Urgent" : null} />
                    )}
                  </PLField>

                  <div className="sm:col-span-2">
                    <PLField label="Employment Type">
                      {canEditThis ? (
                        <CheckboxGroup
                          name="employmentType"
                          options={EMPLOYMENT_TYPE_OPTIONS}
                          selected={csvToList(e.employmentType)}
                        />
                      ) : (
                        <ReadOnly value={e.employmentType} />
                      )}
                    </PLField>
                  </div>

                  <div className="sm:col-span-2">
                    <PLField label="Position Type">
                      {canEditThis ? (
                        <CheckboxGroup
                          name="positionType"
                          options={POSITION_TYPE_OPTIONS}
                          selected={csvToList(e.positionType)}
                        />
                      ) : (
                        <ReadOnly value={e.positionType} />
                      )}
                    </PLField>
                  </div>

                  <PLField label="Direct Supervisor">
                    {canEditThis ? (
                      <input name="directSupervisor" defaultValue={e.directSupervisor ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.directSupervisor} />
                    )}
                  </PLField>

                  <PLField label="Job Number">
                    {canEditThis ? (
                      <input name="jobNumber" defaultValue={e.jobNumber ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.jobNumber} />
                    )}
                  </PLField>

                  <PLField label="Job Site">
                    {canEditThis ? (
                      <input name="jobSite" defaultValue={e.jobSite ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.jobSite} />
                    )}
                  </PLField>

                  <PLField label="Driving Record Required">
                    {canEditThis ? (
                      <select name="drivingRecordRequired" defaultValue={triValue(e.drivingRecordRequired)} className={inputCls}>
                        <option value="">—</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <ReadOnly value={yesNoText(e.drivingRecordRequired)} />
                    )}
                  </PLField>

                  <div className="sm:col-span-2">
                    <PLField label="Current Lift Operator Certifications (if applicable)">
                      {canEditThis ? (
                        <input name="liftOperatorCertifications" defaultValue={e.liftOperatorCertifications ?? ""} className={inputCls} />
                      ) : (
                        <ReadOnly value={e.liftOperatorCertifications} />
                      )}
                    </PLField>
                  </div>

                  <PLField label="Site Specifics Needed">
                    {canEditThis ? (
                      <select name="siteSpecificsNeeded" defaultValue={triValue(e.siteSpecificsNeeded)} className={inputCls}>
                        <option value="">—</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <ReadOnly value={yesNoText(e.siteSpecificsNeeded)} />
                    )}
                  </PLField>

                  <PLField label="Fit Test Needed">
                    {canEditThis ? (
                      <select name="fitTestNeeded" defaultValue={triValue(e.fitTestNeeded)} className={inputCls}>
                        <option value="">—</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <ReadOnly value={yesNoText(e.fitTestNeeded)} />
                    )}
                  </PLField>

                  <div className="sm:col-span-2">
                    <PLField label="Additional Trainings Needed">
                      {canEditThis ? (
                        <textarea name="additionalTrainingsNeeded" defaultValue={e.additionalTrainingsNeeded ?? ""} rows={2} className={inputCls} />
                      ) : (
                        <ReadOnly value={e.additionalTrainingsNeeded} />
                      )}
                    </PLField>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-4">
                    <PLField label="Safety Equipment Needed">
                      {canEditThis ? (
                        <CheckboxGroup
                          name="safetyEquipmentNeeded"
                          options={SAFETY_EQUIPMENT_OPTIONS}
                          selected={csvToList(e.safetyEquipmentNeeded)}
                        />
                      ) : (
                        <ReadOnly value={e.safetyEquipmentNeeded} />
                      )}
                    </PLField>
                  </div>

                  <div className="sm:col-span-2">
                    <PLField label="Additional Equipment Needs (e.g. UT Kit)">
                      {canEditThis ? (
                        <input name="additionalEquipmentNeeds" defaultValue={e.additionalEquipmentNeeds ?? ""} className={inputCls} />
                      ) : (
                        <ReadOnly value={e.additionalEquipmentNeeds} />
                      )}
                    </PLField>
                  </div>
                </>
              )}

              {canEditThis && (
                <div className="flex justify-end border-t border-white/10 pt-3 sm:col-span-2 lg:col-span-4">
                  <button type="submit" className={primaryBtnCls}>
                    Save details
                  </button>
                </div>
              )}
            </form>
          </section>
        )}

        {canFileStatusChange && (
          <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
            <h2 className={h2Cls}>Employee Status Change</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Third step after Project Lead Details. Submitting updates this employee&apos;s record (site,
              job number, employment type, driving record, credit card, and Inactive for a layoff) and
              emails HR, Tracks, and Safety the completed form as a PDF.
            </p>
            <form action={submitStatusChange} className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="employeeId" value={e.id} />

              <PLField label="Effective Date of Change">
                <input type="date" name="effectiveDate" className={inputCls} />
              </PLField>
              <PLField label="Reason for Change">
                <select name="reasonForChange" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  {STATUS_CHANGE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </PLField>

              <div className="sm:col-span-2">
                <PLField label="Employment Type">
                  <CheckboxGroup name="employmentType" options={EMPLOYMENT_TYPE_OPTIONS} selected={[]} />
                </PLField>
              </div>

              <PLField label="From Job Number">
                <input name="fromJobNumber" defaultValue={e.jobNumber ?? ""} className={inputCls} />
              </PLField>
              <PLField label="To Job Number">
                <input name="toJobNumber" className={inputCls} />
              </PLField>

              <PLField label="New Site">
                <input name="newSite" defaultValue={e.site ?? ""} className={inputCls} placeholder="Leave unchanged if not moving sites" />
              </PLField>
              <PLField label="Requesting Manager Name">
                <input name="requestingManagerName" defaultValue={me.name ?? ""} className={inputCls} />
              </PLField>

              <div className="sm:col-span-2 lg:col-span-4">
                <PLField label="Details of Change">
                  <textarea name="detailsOfChange" rows={2} className={inputCls} />
                </PLField>
              </div>

              <PLField label="Driving Record Required">
                <select name="drivingRecordRequired" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </PLField>
              <PLField label="Corporate Credit Card Requested">
                <select name="creditCardRequested" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </PLField>

              <PLField label="Approved by GM">
                <select name="creditCardApprovedByGm" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </PLField>
              <PLField label="Deactivate FER Email/SharePoint Access">
                <select name="deactivateEmailAccess" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </PLField>

              <PLField label="Deactivate FER Corporate American Express Card">
                <select name="deactivateAmexCard" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </PLField>

              <div className="flex justify-end border-t border-white/10 pt-3 sm:col-span-2 lg:col-span-4">
                <button type="submit" className={primaryBtnCls}>
                  Submit Status Change
                </button>
              </div>
            </form>

            {statusChangeHistory.length > 0 && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <h3 className={h3Cls}>Previous changes</h3>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-400">
                  {statusChangeHistory.map((s) => (
                    <li key={s.id}>
                      {s.createdAt.toISOString().slice(0, 10)} — {s.submittedByName}:{" "}
                      {s.reasonForChange || "(no reason given)"}
                      {s.newSite ? ` · New site: ${s.newSite}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {canFullView && (
        <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
          <h2 className={h2Cls}>Details</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Email" value={e.email} />
            <Detail label="Phone" value={e.phone} />
            {canView(access, "ssn") && (
              <div>
                <dt className={labelCls}>SSN</dt>
                <dd className="mt-0.5 text-white">
                  <SecretField
                    maskedValue={maskSsn(safeDecrypt(e.ssn))}
                    employeeId={e.id}
                    field="ssn"
                    label="SSN"
                    canReveal={canView(access, "ssn")}
                  />
                </dd>
              </div>
            )}
            {/* The three ID fields are encrypted at rest; show only the masked
                last-4 via SecretField, each wrapped in its own per-field
                canView guard (deliberate tightening — never exposes a field to
                a role that could not already see it; per FIX1, SAFETY never
                reaches this {canFullView} section at all). */}
            {canView(access, "driverLicense") && (
              <div>
                <dt className={labelCls}>Driver&apos;s license</dt>
                <dd className="mt-0.5 text-white">
                  <SecretField
                    maskedValue={maskLast4(safeDecrypt(e.driversLicenseNumber))}
                    employeeId={e.id}
                    field="driversLicense"
                    label="Driver's license"
                    canReveal={canView(access, "driverLicense")}
                  />
                </dd>
              </div>
            )}
            {canView(access, "dob") && (
              <Detail label="Date of Birth" value={e.dateOfBirth ? e.dateOfBirth.toISOString().slice(0, 10) : null} />
            )}
            {canView(access, "ktn") && (
              <div>
                <dt className={labelCls}>Known Traveler #</dt>
                <dd className="mt-0.5 text-white">
                  <SecretField
                    maskedValue={maskLast4(safeDecrypt(e.knownTravelerNumber))}
                    employeeId={e.id}
                    field="ktn"
                    label="Known Traveler #"
                    canReveal={canView(access, "ktn")}
                  />
                </dd>
              </div>
            )}
            <Detail label="Address" value={[e.addressLine1, e.addressLine2, e.city, e.state, e.zip].filter(Boolean).join(", ")} />
            {canView(access, "safetyExpiry") && (
              <div>
                <dt className={labelCls}>Safety Council ID</dt>
                <dd className="mt-0.5 text-white">
                  <SecretField
                    maskedValue={maskLast4(safeDecrypt(e.safetyCouncilId))}
                    employeeId={e.id}
                    field="safetyCouncil"
                    label="Safety Council ID"
                    canReveal={canView(access, "safetyExpiry")}
                  />
                </dd>
              </div>
            )}
            {canView(access, "twicExpiry") && (
              <div>
                <dt className={labelCls}>TWIC #</dt>
                <dd className="mt-0.5 text-white">
                  <SecretField
                    maskedValue={maskLast4(safeDecrypt(e.twicNumber))}
                    employeeId={e.id}
                    field="twic"
                    label="TWIC #"
                    canReveal={canView(access, "twicExpiry")}
                  />
                </dd>
              </div>
            )}
          </dl>
        </section>
        )}

        {canFullView && (
        <>
        <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2Cls}>Documents</h2>
            {e.documents.length > 0 && (
              <PinUnlockLink
                href={`/api/documents-export/${e.id}`}
                scope="export"
                className="text-xs font-semibold text-sky-300 hover:text-sky-200 hover:underline"
              >
                Download all
              </PinUnlockLink>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_CATEGORIES.map((cat) => {
              const docs = docsByCategory(cat.key);
              return (
                <div key={cat.key} className="min-w-0 rounded-lg border border-white/10 bg-[#0a1426]/70 p-2.5">
                  <h3 className={h3Cls}>{cat.label}</h3>
                  {docs.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">No files</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {docs.map((d) => (
                        <DocRow key={d.id} employeeId={e.id} doc={d} canManage={isAdmin} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {e.certifications.length > 0 && (
          <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
            <h2 className={h2Cls}>Certifications</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              {e.certifications.map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.issuer ? ` · ${c.issuer}` : ""}
                  {c.expiryDate ? ` · expires ${c.expiryDate.toISOString().slice(0, 10)}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
        </>
        )}

        {canShareTimesheet && (
          <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={h2Cls}>Timesheets</h2>
              {canSeeTimesheetsPage && (
                <Link href={`/admin/timesheets?employeeId=${e.id}`} className="text-xs font-semibold text-sky-300 hover:text-sky-200 hover:underline">
                  View timesheets →
                </Link>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              A private link {name || "the employee"} uses to enter their own weekly time -- no password,
              and no access to anything else in this app.{" "}
              {e.email
                ? `Generating a link emails it to ${e.email}.`
                : "There's no email on file, so copy the link and send it to them yourself."}
            </p>
            {timesheetToken && !timesheetToken.revokedAt ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-lg border border-white/10 bg-[#0a1426] px-2 py-1 text-xs text-sky-300 break-all">
                  {timesheetBase}/timesheet/{timesheetToken.token}
                </code>
                {e.email && (
                  <form action={resendTimesheetLink}>
                    <input type="hidden" name="employeeId" value={e.id} />
                    <button className="text-xs text-cyan-300 hover:underline">Resend email</button>
                  </form>
                )}
                <form action={revokeTimesheetLink}>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <button className="text-xs text-rose-300 hover:underline">Revoke</button>
                </form>
              </div>
            ) : (
              <form action={generateTimesheetLink} className="mt-3">
                <input type="hidden" name="employeeId" value={e.id} />
                <button className={secondaryBtnCls}>
                  {timesheetToken ? "Generate new link" : "Generate link"}
                </button>
              </form>
            )}
          </section>
        )}

        {isAdmin && (
          <section className={`mt-3 p-3 sm:p-4 ${cardCls}`}>
            <h2 className={h2Cls}>Shared with</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Give one specific person view/download access to this employee&apos;s documents, regardless
              of their role. This never grants edit access.
            </p>

            {existingGrants.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {existingGrants.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0a1426]/70 px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 break-all text-white">{g.user.name || g.user.email}</span>
                    <PinConfirmButton
                      action={revokeDocumentAccess}
                      fields={{ employeeId: id, userId: g.userId }}
                      confirmMessage={`Revoke document access for ${g.user.name || g.user.email}?`}
                      className="text-xs text-rose-300 hover:underline"
                    >
                      Revoke
                    </PinConfirmButton>
                  </li>
                ))}
              </ul>
            )}

            {grantableUsers.length > 0 ? (
              <form action={grantDocumentAccess} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input type="hidden" name="employeeId" value={id} />
                <select name="userId" defaultValue="" required className={`${inputCls} min-w-0`}>
                  <option value="" disabled>
                    Choose a person…
                  </option>
                  {grantableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ? `${u.name} (${u.email})` : u.email} · {u.role}
                    </option>
                  ))}
                </select>
                <button className={`whitespace-nowrap ${secondaryBtnCls}`}>
                  Grant access
                </button>
              </form>
            ) : (
              existingGrants.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">No other active users to share with.</p>
              )
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className={labelCls}>{label}</dt>
      <dd className="mt-0.5 break-words text-white">{value || "—"}</dd>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-[#0a1426] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40 [color-scheme:dark]";
const cardCls =
  "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
const h2Cls =
  "flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white before:h-3.5 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-sky-400 before:to-blue-600 before:content-['']";
const h3Cls = "text-[11px] font-semibold uppercase tracking-wider text-sky-300/90";
const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-slate-400";
const chipLinkCls =
  "flex h-8 items-center rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300 hover:border-sky-400/50 hover:text-sky-200";
const primaryBtnCls =
  "h-8 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-blue-600/30 hover:from-sky-400 hover:to-blue-500";
const secondaryBtnCls =
  "h-8 rounded-lg border border-white/10 bg-[#0a1426] px-3 text-xs text-slate-300 hover:border-sky-400/40 hover:bg-white/5";

// Display only: initials for the header badge.
function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

// Display only: colour for the status pill in the header.
function statusTone(status: string) {
  if (status === "APPROVED" || status === "ACTIVE") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "INACTIVE" || status === "REJECTED") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function triValue(v: boolean | null) {
  return v === true ? "true" : v === false ? "false" : "";
}

function yesNoText(v: boolean | null) {
  return v == null ? "—" : v ? "Yes" : "No";
}

function PLField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={labelCls}>{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReadOnly({ value }: { value?: string | null }) {
  return <div className="break-words rounded-lg border border-white/5 bg-[#0a1426]/50 px-2.5 py-1.5 text-xs text-white">{value || "—"}</div>;
}

function CheckboxGroup({
  name,
  options,
  selected,
}: {
  name: string;
  options: string[];
  selected: string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <label
          key={opt}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a1426] px-2 py-1 text-xs text-slate-300 hover:border-sky-400/40 has-[:checked]:border-sky-400/50 has-[:checked]:bg-sky-500/10 has-[:checked]:text-sky-100"
        >
          <input
            type="checkbox"
            name={name}
            value={opt}
            defaultChecked={selected.includes(opt)}
            className="h-3.5 w-3.5 rounded border-white/10 bg-slate-800 accent-sky-500"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}
