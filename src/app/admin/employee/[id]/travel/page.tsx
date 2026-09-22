import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, isAssignedProjectLeadOrManager } from "@/lib/rbac";
import { submitTravelRequest } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400 w-full";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function YesNoSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={inputCls}>
      <option value="">—</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
}

export default async function TravelRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;

  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) notFound();

  const isAdmin = isAdminRole(me.role);
  if (!isAdmin && !isAssignedProjectLeadOrManager(me, e)) {
    redirect(`/admin/employee/${id}`);
  }

  // Auto-fill whatever is already on this employee's grid record.
  const client = e.site
    ? await prisma.client.findFirst({ where: { site: e.site }, select: { name: true } })
    : null;
  const name = [e.firstName, e.lastName].filter(Boolean).join(" ");

  return (
    <main className="min-h-screen py-10">
      <div className="mx-auto max-w-3xl px-4">
        <Link href={`/admin/employee/${id}`} className="text-sm text-cyan-400 hover:underline">
          ← Back to {name || "employee"}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Travel Request</h1>
        <p className="text-sm text-slate-400">
          Pre-filled from {name || "the employee"}&apos;s record where available. Submitting emails the
          Travel Administrator.
        </p>

        <form
          action={submitTravelRequest}
          className="mt-6 space-y-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur"
        >
          <input type="hidden" name="employeeId" value={e.id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="FER Job Number">
              <input name="jobNumber" defaultValue={e.jobNumber ?? ""} className={inputCls} />
            </Field>
            <Field label="Client Name">
              <input name="clientName" defaultValue={client?.name ?? ""} className={inputCls} />
            </Field>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
              Traveler Information
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name (as it appears on ID)">
                <input name="fullName" defaultValue={name} required className={inputCls} />
              </Field>
              <Field label="Date of Birth">
                <input type="date" name="dateOfBirth" className={inputCls} />
              </Field>
              <Field label="Gender">
                <input name="gender" className={inputCls} />
              </Field>
              <Field label="Known Traveler # (if applicable)">
                <input name="knownTravelerNumber" className={inputCls} />
              </Field>
              <Field label="Phone Number">
                <input name="phone" defaultValue={e.phone ?? ""} className={inputCls} />
              </Field>
              <Field label="Email Address">
                <input type="email" name="email" defaultValue={e.email ?? ""} className={inputCls} />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
              Flight Information
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Flight Needed">
                <YesNoSelect name="flightNeeded" />
              </Field>
              <Field label="Travel Type">
                <input name="travelType" placeholder="e.g. Round trip" className={inputCls} />
              </Field>
              <Field label="Date of Departure">
                <input type="date" name="dateOfDeparture" className={inputCls} />
              </Field>
              <Field label="Date of Return (if applicable)">
                <input type="date" name="dateOfReturn" className={inputCls} />
              </Field>
              <Field label="Departure Location">
                <input name="departureLocation" className={inputCls} />
              </Field>
              <Field label="Destination Location">
                <input name="destinationLocation" defaultValue={e.site ?? ""} className={inputCls} />
              </Field>
              <Field label="Window or Aisle Seat (if available)">
                <input name="seatPreference" className={inputCls} />
              </Field>
              <Field label="Time of Travel Preference (if available)">
                <input name="timePreference" className={inputCls} />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
              Rental Car Information
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Rental Car Needed">
                <YesNoSelect name="rentalCarNeeded" />
              </Field>
              <Field label="Rental Car Type">
                <input name="rentalCarType" className={inputCls} />
              </Field>
              <Field label="Pickup Location">
                <input name="pickupLocation" className={inputCls} />
              </Field>
              <Field label="Dropoff Location">
                <input name="dropoffLocation" className={inputCls} />
              </Field>
              <Field label="Date of Pickup">
                <input type="date" name="dateOfPickup" className={inputCls} />
              </Field>
              <Field label="Date of Return">
                <input type="date" name="dateOfCarReturn" className={inputCls} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Rental Car Type Justification">
                  <textarea name="rentalCarJustification" rows={2} className={inputCls} />
                </Field>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
              Receipt To Be Sent To
            </h2>
            <div className="mt-3">
              <Field label="Email Address of Manager for Billing">
                <input
                  type="email"
                  name="billingManagerEmail"
                  defaultValue={e.projectManagerEmail ?? e.projectLeadEmail ?? ""}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <Field label="Additional Comments">
            <textarea name="additionalComments" rows={3} className={inputCls} />
          </Field>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500"
          >
            Submit Travel Request
          </button>
        </form>
      </div>
    </main>
  );
}
