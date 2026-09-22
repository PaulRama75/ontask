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
} from "@/lib/rbac";
import { saveProjectLeadDetails, grantDocumentAccess, revokeDocumentAccess } from "../../actions";
import DocRow from "./DocRow";
import CurrencyInput from "../../CurrencyInput";
import { formatCurrency } from "@/lib/currency";
import { submitStatusChange } from "./status-change/actions";
import { generateTimesheetLink, revokeTimesheetLink } from "./timesheet-link/actions";

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

  const timesheetToken = isAdmin
    ? await prisma.employeeTimesheetToken.findUnique({ where: { employeeId: id } })
    : null;
  const timesheetBase = process.env.APP_BASE_URL ?? "http://localhost:3000";

  return (
    <main className="min-h-screen py-10">
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="text-sm text-cyan-400 hover:underline">
            ← Back to admin
          </Link>
          {(canEditThis || isAdmin) && (
            <Link href={`/admin/employee/${id}/travel`} className="text-sm text-cyan-400 hover:underline">
              Travel Request →
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold text-white">{name}</h1>
        <p className="text-sm text-slate-400">
          {canFullView ? "Document library" : "Project Lead details"} · status {e.status}
        </p>
        {travelSent === "1" && (
          <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Travel request submitted and emailed to the Travel Administrator.
          </p>
        )}

        {(canFullView || canEditThis) && (
          <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Project Lead Details</h2>
            <p className="mt-1 text-xs text-slate-400">
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
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
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

                  <PLField label="Current Lift Operator Certifications (if applicable)">
                    {canEditThis ? (
                      <input name="liftOperatorCertifications" defaultValue={e.liftOperatorCertifications ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.liftOperatorCertifications} />
                    )}
                  </PLField>

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

                  <div className="sm:col-span-2">
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
                <div className="sm:col-span-2">
                  <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500">
                    Save details
                  </button>
                </div>
              )}
            </form>
          </section>
        )}

        {canFileStatusChange && (
          <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Employee Status Change</h2>
            <p className="mt-1 text-xs text-slate-400">
              Third step after Project Lead Details. Submitting emails HR, Tracks, and Safety. A new
              site here also updates the employee&apos;s Site on the grid.
            </p>
            <form action={submitStatusChange} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="employeeId" value={e.id} />

              <PLField label="Effective Date of Change">
                <input type="date" name="effectiveDate" className={inputCls} />
              </PLField>
              <PLField label="Reason for Change">
                <input name="reasonForChange" className={inputCls} />
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

              <div className="sm:col-span-2">
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

              <div className="sm:col-span-2">
                <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500">
                  Submit Status Change
                </button>
              </div>
            </form>

            {statusChangeHistory.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-4">
                <h3 className="text-sm font-semibold text-slate-300">Previous changes</h3>
                <ul className="mt-2 space-y-2 text-xs text-slate-400">
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
        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Details</h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Detail label="Email" value={e.email} />
            <Detail label="Phone" value={e.phone} />
            <Detail label="SSN" value={e.ssn} />
            <Detail label="Driver's license" value={e.driversLicenseNumber} />
            <Detail label="Address" value={[e.addressLine1, e.addressLine2, e.city, e.state, e.zip].filter(Boolean).join(", ")} />
            <Detail label="Safety Council ID" value={e.safetyCouncilId} />
            <Detail label="TWIC #" value={e.twicNumber} />
          </dl>
        </section>
        )}

        {canFullView && (
        <>
        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Documents</h2>
            {e.documents.length > 0 && (
              <a
                href={`/api/documents-export/${e.id}`}
                className="text-sm text-cyan-400 hover:underline"
              >
                Download all
              </a>
            )}
          </div>
          <div className="mt-3 space-y-4">
            {DOCUMENT_CATEGORIES.map((cat) => {
              const docs = docsByCategory(cat.key);
              return (
                <div key={cat.key}>
                  <h3 className="text-sm font-semibold text-slate-300">{cat.label}</h3>
                  {docs.length === 0 ? (
                    <p className="text-sm text-slate-500">No files</p>
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
          <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Certifications</h2>
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

        {isAdmin && (
          <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Timesheets</h2>
              <Link href={`/admin/timesheets?employeeId=${e.id}`} className="text-sm text-cyan-400 hover:underline">
                View timesheets →
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Share this link with {name || "the employee"} so they can enter their own weekly time --
              no password, and no access to anything else in this app.
            </p>
            {timesheetToken && !timesheetToken.revokedAt ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded bg-slate-950/60 px-2 py-1 text-xs text-cyan-300 break-all">
                  {timesheetBase}/timesheet/{timesheetToken.token}
                </code>
                <form action={revokeTimesheetLink}>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <button className="text-xs text-rose-300 hover:underline">Revoke</button>
                </form>
              </div>
            ) : (
              <form action={generateTimesheetLink} className="mt-3">
                <input type="hidden" name="employeeId" value={e.id} />
                <button className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                  {timesheetToken ? "Generate new link" : "Generate link"}
                </button>
              </form>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Shared with</h2>
            <p className="mt-1 text-xs text-slate-400">
              Give one specific person view/download access to this employee&apos;s documents, regardless
              of their role. This never grants edit access.
            </p>

            {existingGrants.length > 0 && (
              <ul className="mt-3 space-y-2">
                {existingGrants.map((g) => (
                  <li key={g.id} className="flex items-center justify-between text-sm">
                    <span className="text-white">{g.user.name || g.user.email}</span>
                    <form action={revokeDocumentAccess}>
                      <input type="hidden" name="employeeId" value={id} />
                      <input type="hidden" name="userId" value={g.userId} />
                      <button className="text-xs text-rose-300 hover:underline">Revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {grantableUsers.length > 0 ? (
              <form action={grantDocumentAccess} className="mt-4 flex items-center gap-2">
                <input type="hidden" name="employeeId" value={id} />
                <select name="userId" defaultValue="" required className={inputCls}>
                  <option value="" disabled>
                    Choose a person…
                  </option>
                  {grantableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ? `${u.name} (${u.email})` : u.email} · {u.role}
                    </option>
                  ))}
                </select>
                <button className="whitespace-nowrap rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
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
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-white">{value || "—"}</dd>
    </div>
  );
}

const inputCls = "rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400 w-full";

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
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReadOnly({ value }: { value?: string | null }) {
  return <div className="text-white">{value || "—"}</div>;
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
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            name={name}
            value={opt}
            defaultChecked={selected.includes(opt)}
            className="h-4 w-4 rounded border-white/10 bg-slate-800"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}
