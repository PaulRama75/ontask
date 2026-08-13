import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  getAccessMap,
  canView,
  canEdit,
  canApprove,
  isAdminRole,
  getNavAccess,
  firstAllowedNavHref,
} from "@/lib/rbac";
import { setApproved, setActive } from "../actions";
import { findDuplicateEmployeeIds } from "@/lib/duplicates";
import GridControls from "./GridControls";
import SiteCell from "./SiteCell";
import RateCell from "./RateCell";
import EditableCell from "./EditableCell";
import NameCell from "./NameCell";
import AddressCell from "./AddressCell";
import UploadCell from "./UploadCell";
import FlagCell from "./FlagCell";
import FrcCell from "./FrcCell";

export const dynamic = "force-dynamic";

type DocLite = { id: string; fileName: string; category: string; label: string | null };

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

// Value for an <input type="date">: ISO yyyy-mm-dd or empty.
function dateInputValue(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

// Tri-state yes/no display.
function yesNo(v: boolean | null) {
  return v == null ? "—" : v ? "Yes" : "No";
}

// Renders attachment hyperlinks for a given document category. Prefers the
// document's title (Document.label, e.g. a certification name) as the link
// text so the user can tell which file is which without opening it.
function DocLinks({ docs, category }: { docs: DocLite[]; category: string }) {
  const items = docs.filter((d) => d.category === category);
  if (items.length === 0) return <span className="text-slate-600">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((d, i) => {
        const title = d.label?.trim();
        return (
          <a
            key={d.id}
            href={`/api/files/${d.id}`}
            target="_blank"
            className="text-cyan-400 hover:underline"
            title={d.fileName}
          >
            {title || (items.length > 1 ? `file ${i + 1}` : "view")}
          </a>
        );
      })}
    </div>
  );
}

export default async function GridPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.grid) redirect(firstAllowedNavHref(nav));
  const access = await getAccessMap(me.role);
  const show = (k: string) => canView(access, k);
  const editable = (k: string) => canEdit(access, k);
  const approvable = (k: string) => canApprove(access, k);
  const canLibrary = canView(access, "library");
  // Project Leads without library access can still open the employee page to
  // fill the grouped PL details form, so let them reach it from the name link.
  const canPLDetails = ["site", "hireDate", "payRate", "billRate", "frc", "creditCard", "emailNeeded"].some(
    (k) => canEdit(access, k),
  );
  const canOpenDetails = canLibrary || canPLDetails;

  const { q = "", status = "all" } = await searchParams;

  // Site-level (row) access: a non-admin with assigned sites only sees those.
  let restrictedSites: Set<string> | null = null;
  if (!isAdminRole(me.role)) {
    const mine = await prisma.userSite.findMany({
      where: { userId: me.id },
      select: { site: true },
    });
    if (mine.length > 0) restrictedSites = new Set(mine.map((s) => s.site));
  }

  const all = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      documents: { select: { id: true, fileName: true, category: true, label: true } },
      certifications: { select: { name: true } },
    },
  });

  // Detected across the full unfiltered set so a duplicate's badge still
  // shows even when its match got filtered out of view (e.g. different site).
  const duplicateIds = findDuplicateEmployeeIds(all);

  const needle = q.trim().toLowerCase();
  const employees = all.filter((e) => {
    // Site-level access: restricted users only see their assigned sites.
    if (restrictedSites && !(e.site && restrictedSites.has(e.site))) return false;
    // Text search across the visible identity/contact fields + cert names.
    if (needle) {
      const haystack = [
        e.firstName,
        e.lastName,
        e.email,
        e.phone,
        e.ssn,
        e.addressLine1,
        e.addressLine2,
        e.city,
        e.state,
        e.zip,
        e.driversLicenseNumber,
        e.site,
        ...e.certifications.map((c) => c.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    // Status filter.
    if (status === "approved" && !e.approved) return false;
    if (status === "pending" && e.approved) return false;
    if (status === "missing_docs" && e.documents.length > 0) return false;
    if (status === "active" && !e.active) return false;
    if (status === "inactive" && e.active) return false;
    if (status === "duplicates" && !duplicateIds.has(e.id)) return false;
    return true;
  });

  // Grid columns in display order, each mapped to an access key.
  const gridCols = [
    "name",
    "site",
    "active",
    "address",
    "email",
    "phone",
    "ssn",
    "driverLicense",
    "safetyExpiry",
    "twicExpiry",
    "certification",
    "utilityBill",
    "hireDate",
    "frc",
    "creditCard",
    "emailNeeded",
    "approved",
  ];
  // Pay Rate and Bill Rate are separately access-controlled columns.
  const visibleCount =
    gridCols.filter(show).length + (show("payRate") ? 1 : 0) + (show("billRate") ? 1 : 0);

  const th =
    "border border-white/10 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 whitespace-nowrap";
  const td = "border border-white/10 px-2 py-1.5 align-top text-slate-200";

  return (
    <main className="min-h-screen bg-slate-950 py-8">
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Employee Data Grid</h1>
            <p className="text-sm text-slate-400">
              All employees with document attachments and approval status.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-cyan-400 hover:underline">
            ← Admin home
          </Link>
        </div>

        <GridControls
          total={all.length}
          shown={employees.length}
          duplicateCount={duplicateIds.size}
        />

        <div className="overflow-x-auto rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                {show("name") && <th className={th}>Employee</th>}
                {show("site") && <th className={th}>Site</th>}
                {show("active") && <th className={th}>Status</th>}
                {show("address") && <th className={th}>Address</th>}
                {show("email") && <th className={th}>Email</th>}
                {show("phone") && <th className={th}>Phone</th>}
                {show("ssn") && <th className={th}>SS#</th>}
                {show("driverLicense") && <th className={th}>Driver License</th>}
                {show("safetyExpiry") && <th className={th}>Safety Expiry</th>}
                {show("twicExpiry") && <th className={th}>TWIC Expiry</th>}
                {show("certification") && <th className={th}>Certification</th>}
                {show("utilityBill") && <th className={th}>Utility Bill</th>}
                {show("payRate") && <th className={th}>Pay Rate</th>}
                {show("billRate") && <th className={th}>Bill Rate</th>}
                {show("hireDate") && <th className={th}>Hire Date</th>}
                {show("frc") && <th className={th}>FRC</th>}
                {show("creditCard") && <th className={th}>Credit Card</th>}
                {show("emailNeeded") && <th className={th}>Email Needed</th>}
                {show("approved") && <th className={th}>Approved</th>}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-slate-500`} colSpan={visibleCount || 1}>
                    {all.length === 0 ? "No employees yet." : "No employees match your search/filter."}
                  </td>
                </tr>
              )}
              {employees.map((e) => {
                const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || "(unnamed)";
                const address = [e.addressLine1, e.addressLine2, e.city, e.state, e.zip]
                  .filter(Boolean)
                  .join(", ");
                const certNames = e.certifications.map((c) => c.name).join(", ");
                return (
                  <tr key={e.id} className={e.approved ? "bg-emerald-500/10" : ""}>
                    {show("name") && (
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {editable("name") ? (
                          <NameCell
                            id={e.id}
                            firstName={e.firstName}
                            lastName={e.lastName}
                            canOpenLibrary={canOpenDetails}
                          />
                        ) : canOpenDetails ? (
                          <Link href={`/admin/employee/${e.id}`} className="text-cyan-400 hover:underline">
                            {name}
                          </Link>
                        ) : (
                          <span>{name}</span>
                        )}
                        {duplicateIds.has(e.id) && (
                          <span
                            title="Another employee shares this name or email — possible duplicate onboarding."
                            className="ml-1 inline-block rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                          >
                            Duplicate
                          </span>
                        )}
                      </td>
                    )}
                    {show("site") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("site") ? (
                          <SiteCell id={e.id} site={e.site} />
                        ) : (
                          <span>{e.site || "—"}</span>
                        )}
                      </td>
                    )}
                    {show("active") && (
                      <td className={`${td} whitespace-nowrap text-center`}>
                        {editable("active") ? (
                          <form action={setActive}>
                            <input type="hidden" name="employeeId" value={e.id} />
                            <input type="hidden" name="active" value={(!e.active).toString()} />
                            <button
                              type="submit"
                              className={
                                e.active
                                  ? "rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                                  : "rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600"
                              }
                              title="Click to toggle"
                            >
                              {e.active ? "Active" : "Inactive"}
                            </button>
                          </form>
                        ) : (
                          <span
                            className={
                              e.active
                                ? "rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300"
                                : "rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300"
                            }
                          >
                            {e.active ? "Active" : "Inactive"}
                          </span>
                        )}
                      </td>
                    )}
                    {show("address") && (
                      <td className={td}>
                        {editable("address") ? (
                          <AddressCell
                            id={e.id}
                            addr={{
                              addressLine1: e.addressLine1,
                              addressLine2: e.addressLine2,
                              city: e.city,
                              state: e.state,
                              zip: e.zip,
                            }}
                          />
                        ) : (
                          address || "—"
                        )}
                      </td>
                    )}
                    {show("email") && (
                      <td className={td}>
                        {editable("email") ? (
                          <EditableCell id={e.id} column="email" value={e.email} type="email" width="w-44" />
                        ) : e.email ? (
                          <a href={`mailto:${e.email}`} className="text-cyan-400 hover:underline">
                            {e.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {show("phone") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("phone") ? (
                          <EditableCell id={e.id} column="phone" value={e.phone} type="tel" width="w-28" />
                        ) : (
                          e.phone || "—"
                        )}
                      </td>
                    )}
                    {show("ssn") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("ssn") ? (
                          <EditableCell id={e.id} column="ssn" value={e.ssn} width="w-24" />
                        ) : (
                          e.ssn || "—"
                        )}
                      </td>
                    )}
                    {show("driverLicense") && (
                      <td className={td}>
                        {editable("driverLicense") ? (
                          <EditableCell
                            id={e.id}
                            column="driverLicense"
                            value={e.driversLicenseNumber}
                            width="w-28"
                          />
                        ) : (
                          <div className="text-xs text-slate-400">{e.driversLicenseNumber || ""}</div>
                        )}
                        <DocLinks docs={e.documents} category="LICENSE" />
                        {editable("driverLicense") && <UploadCell id={e.id} column="driverLicense" />}
                      </td>
                    )}
                    {show("safetyExpiry") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("safetyExpiry") ? (
                          <EditableCell
                            id={e.id}
                            column="safetyExpiry"
                            value={dateInputValue(e.safetyCouncilExpiry)}
                            type="date"
                            width="w-36"
                          />
                        ) : (
                          <div>{fmtDate(e.safetyCouncilExpiry)}</div>
                        )}
                        <DocLinks docs={e.documents} category="SAFETY_COUNCIL" />
                        {editable("safetyExpiry") && <UploadCell id={e.id} column="safetyExpiry" />}
                      </td>
                    )}
                    {show("twicExpiry") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("twicExpiry") ? (
                          <EditableCell
                            id={e.id}
                            column="twicExpiry"
                            value={dateInputValue(e.twicExpiry)}
                            type="date"
                            width="w-36"
                          />
                        ) : (
                          <div>{fmtDate(e.twicExpiry)}</div>
                        )}
                        <DocLinks docs={e.documents} category="TWIC" />
                        {editable("twicExpiry") && <UploadCell id={e.id} column="twicExpiry" />}
                      </td>
                    )}
                    {show("certification") && (
                      <td className={td}>
                        <div className="text-xs text-slate-400">{certNames}</div>
                        <DocLinks docs={e.documents} category="CERTIFICATION" />
                        {editable("certification") && (
                          <UploadCell
                            id={e.id}
                            column="certification"
                            certNames={e.certifications.map((c) => c.name)}
                          />
                        )}
                      </td>
                    )}
                    {show("utilityBill") && (
                      <td className={td}>
                        <DocLinks docs={e.documents} category="UTILITY_BILL" />
                        {editable("utilityBill") && <UploadCell id={e.id} column="utilityBill" />}
                      </td>
                    )}
                    {show("payRate") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("payRate") ? (
                          <RateCell id={e.id} field="payRate" value={e.payRate} />
                        ) : (
                          <span>{e.payRate != null ? `$${e.payRate.toFixed(2)}` : "—"}</span>
                        )}
                      </td>
                    )}
                    {show("billRate") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("billRate") ? (
                          <RateCell id={e.id} field="billRate" value={e.billRate} />
                        ) : (
                          <span>{e.billRate != null ? `$${e.billRate.toFixed(2)}` : "—"}</span>
                        )}
                      </td>
                    )}
                    {show("hireDate") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("hireDate") ? (
                          <EditableCell
                            id={e.id}
                            column="hireDate"
                            value={dateInputValue(e.hireDate)}
                            type="date"
                            width="w-36"
                          />
                        ) : (
                          <span>{fmtDate(e.hireDate)}</span>
                        )}
                      </td>
                    )}
                    {show("frc") && (
                      <td className={`${td} whitespace-nowrap`}>
                        {editable("frc") ? (
                          <FrcCell id={e.id} needed={e.frcNeeded} size={e.frcSize} />
                        ) : (
                          <span>
                            {e.frcNeeded == null
                              ? "—"
                              : e.frcNeeded
                                ? `Yes${e.frcSize ? ` · ${e.frcSize}` : ""}`
                                : "No"}
                          </span>
                        )}
                      </td>
                    )}
                    {show("creditCard") && (
                      <td className={`${td} whitespace-nowrap text-center`}>
                        {editable("creditCard") ? (
                          <FlagCell id={e.id} column="creditCard" value={e.creditCardApproved} />
                        ) : (
                          <span>{yesNo(e.creditCardApproved)}</span>
                        )}
                      </td>
                    )}
                    {show("emailNeeded") && (
                      <td className={`${td} whitespace-nowrap text-center`}>
                        {editable("emailNeeded") ? (
                          <FlagCell id={e.id} column="emailNeeded" value={e.emailNeeded} />
                        ) : (
                          <span>{yesNo(e.emailNeeded)}</span>
                        )}
                      </td>
                    )}
                    {show("approved") && (
                      <td className={`${td} whitespace-nowrap text-center`}>
                        {approvable("approved") ? (
                          <form action={setApproved}>
                            <input type="hidden" name="employeeId" value={e.id} />
                            <input type="hidden" name="approved" value={(!e.approved).toString()} />
                            <button
                              type="submit"
                              className={
                                e.approved
                                  ? "rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                                  : "rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/5"
                              }
                            >
                              {e.approved ? "Approved ✓" : "Approve"}
                            </button>
                          </form>
                        ) : (
                          <span
                            className={
                              e.approved
                                ? "rounded-md bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300"
                                : "rounded-md bg-white/5 px-3 py-1 text-xs font-medium text-slate-400"
                            }
                          >
                            {e.approved ? "Approved ✓" : "Pending"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
