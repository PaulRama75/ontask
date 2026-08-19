import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { getAccessMap, canView, canEdit, isAdminRole } from "@/lib/rbac";
import { saveProjectLeadDetails } from "../../actions";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  // Access: the full library (PII + documents) requires the "library" permission.
  // A Project Lead who can edit any PL field may open the page to fill those
  // fields, but the sensitive sections stay hidden from them.
  const access = await getAccessMap(me.role);
  const canLib = canView(access, "library");
  const canEditPL = PL_FIELDS.some((k) => canEdit(access, k));
  if (!canLib && !canEditPL) redirect("/admin/grid");

  const { id } = await params;
  const e = await prisma.employee.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: "asc" } }, certifications: true },
  });
  if (!e) notFound();

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

  return (
    <main className="min-h-screen bg-slate-950 py-10">
      <div className="mx-auto max-w-4xl px-4">
        <Link href="/admin" className="text-sm text-cyan-400 hover:underline">
          ← Back to admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">{name}</h1>
        <p className="text-sm text-slate-400">
          {canLib ? "Document library" : "Project Lead details"} · status {e.status}
        </p>

        {(canLib || canEditPL) && (
          <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Project Lead Details</h2>
            <p className="mt-1 text-xs text-slate-400">
              Filled in by the Project Lead after the employee completes onboarding.
            </p>
            <form action={saveProjectLeadDetails} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="employeeId" value={e.id} />

              {canView(access, "site") && (
                <PLField label="Site">
                  {canEdit(access, "site") ? (
                    <input name="site" defaultValue={e.site ?? ""} className={inputCls} />
                  ) : (
                    <ReadOnly value={e.site} />
                  )}
                </PLField>
              )}

              {canView(access, "hireDate") && (
                <PLField label="Hire Date">
                  {canEdit(access, "hireDate") ? (
                    <input type="date" name="hireDate" defaultValue={dateInputValue(e.hireDate)} className={inputCls} />
                  ) : (
                    <ReadOnly value={fmtDate(e.hireDate)} />
                  )}
                </PLField>
              )}

              {canView(access, "payRate") && (
                <PLField label="Pay Rate">
                  {canEdit(access, "payRate") ? (
                    <input type="number" step="0.01" min="0" name="payRate" defaultValue={e.payRate ?? ""} className={inputCls} />
                  ) : (
                    <ReadOnly value={e.payRate != null ? `$${e.payRate.toFixed(2)}` : null} />
                  )}
                </PLField>
              )}

              {canView(access, "billRate") && (
                <PLField label="Bill Rate">
                  {canEdit(access, "billRate") ? (
                    <input type="number" step="0.01" min="0" name="billRate" defaultValue={e.billRate ?? ""} className={inputCls} />
                  ) : (
                    <ReadOnly value={e.billRate != null ? `$${e.billRate.toFixed(2)}` : null} />
                  )}
                </PLField>
              )}

              {canView(access, "frc") && (
                <PLField label="FRC Needed / Size">
                  {canEdit(access, "frc") ? (
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
                  {canEdit(access, "creditCard") ? (
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
                  {canEdit(access, "emailNeeded") ? (
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

              {(canEditPL || canLib) && (
                <>
                  <PLField label="Urgency">
                    {canEditPL ? (
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
                      {canEditPL ? (
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
                      {canEditPL ? (
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
                    {canEditPL ? (
                      <input name="directSupervisor" defaultValue={e.directSupervisor ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.directSupervisor} />
                    )}
                  </PLField>

                  <PLField label="Job Number">
                    {canEditPL ? (
                      <input name="jobNumber" defaultValue={e.jobNumber ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.jobNumber} />
                    )}
                  </PLField>

                  <PLField label="Job Site">
                    {canEditPL ? (
                      <input name="jobSite" defaultValue={e.jobSite ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.jobSite} />
                    )}
                  </PLField>

                  <PLField label="Driving Record Required">
                    {canEditPL ? (
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
                    {canEditPL ? (
                      <input name="liftOperatorCertifications" defaultValue={e.liftOperatorCertifications ?? ""} className={inputCls} />
                    ) : (
                      <ReadOnly value={e.liftOperatorCertifications} />
                    )}
                  </PLField>

                  <PLField label="Site Specifics Needed">
                    {canEditPL ? (
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
                    {canEditPL ? (
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
                      {canEditPL ? (
                        <textarea name="additionalTrainingsNeeded" defaultValue={e.additionalTrainingsNeeded ?? ""} rows={2} className={inputCls} />
                      ) : (
                        <ReadOnly value={e.additionalTrainingsNeeded} />
                      )}
                    </PLField>
                  </div>

                  <div className="sm:col-span-2">
                    <PLField label="Safety Equipment Needed">
                      {canEditPL ? (
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
                      {canEditPL ? (
                        <input name="additionalEquipmentNeeds" defaultValue={e.additionalEquipmentNeeds ?? ""} className={inputCls} />
                      ) : (
                        <ReadOnly value={e.additionalEquipmentNeeds} />
                      )}
                    </PLField>
                  </div>
                </>
              )}

              {canEditPL && (
                <div className="sm:col-span-2">
                  <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500">
                    Save details
                  </button>
                </div>
              )}
            </form>
          </section>
        )}

        {canLib && (
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

        {canLib && (
        <>
        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Documents</h2>
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
                      {docs.map((d) => {
                        const title = d.label?.trim();
                        return (
                          <li key={d.id}>
                            <a
                              href={`/api/files/${d.id}`}
                              target="_blank"
                              title={d.fileName}
                              className="text-sm text-cyan-400 hover:underline"
                            >
                              {title && title !== d.fileName ? title : d.fileName}
                            </a>
                            <span className="ml-2 text-xs text-slate-500">
                              {(d.size / 1024).toFixed(0)} KB
                            </span>
                          </li>
                        );
                      })}
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
