"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, isAssignedProjectLeadOrManager } from "@/lib/rbac";
import { notifyTravelRequestSubmitted } from "@/lib/notifications";
import { redirect } from "next/navigation";

const str = (form: FormData, key: string): string | null => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const bool = (form: FormData, key: string): boolean | null => {
  const v = str(form, key);
  return v === "true" ? true : v === "false" ? false : null;
};
const dateOrNull = (form: FormData, key: string): Date | null => {
  const v = str(form, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function submitTravelRequest(form: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not authenticated");

  const employeeId = String(form.get("employeeId") ?? "");
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { projectLeadEmail: true, projectManagerEmail: true, createdById: true },
  });
  if (!employee) throw new Error("Employee not found");
  if (!isAdminRole(me.role) && !isAssignedProjectLeadOrManager(me, employee)) {
    throw new Error("Not authorized for this employee");
  }

  const data = {
    employeeId,
    jobNumber: str(form, "jobNumber"),
    clientName: str(form, "clientName"),
    fullName: str(form, "fullName"),
    dateOfBirth: dateOrNull(form, "dateOfBirth"),
    gender: str(form, "gender"),
    knownTravelerNumber: str(form, "knownTravelerNumber"),
    phone: str(form, "phone"),
    email: str(form, "email"),
    flightNeeded: bool(form, "flightNeeded"),
    travelType: str(form, "travelType"),
    dateOfDeparture: dateOrNull(form, "dateOfDeparture"),
    dateOfReturn: dateOrNull(form, "dateOfReturn"),
    departureLocation: str(form, "departureLocation"),
    destinationLocation: str(form, "destinationLocation"),
    seatPreference: str(form, "seatPreference"),
    timePreference: str(form, "timePreference"),
    rentalCarNeeded: bool(form, "rentalCarNeeded"),
    rentalCarType: str(form, "rentalCarType"),
    rentalCarJustification: str(form, "rentalCarJustification"),
    pickupLocation: str(form, "pickupLocation"),
    dropoffLocation: str(form, "dropoffLocation"),
    dateOfPickup: dateOrNull(form, "dateOfPickup"),
    dateOfCarReturn: dateOrNull(form, "dateOfCarReturn"),
    billingManagerEmail: str(form, "billingManagerEmail"),
    additionalComments: str(form, "additionalComments"),
    submittedByUserId: me.id,
    submittedByName: me.name || me.email,
  };

  await prisma.travelRequest.create({ data });
  await notifyTravelRequestSubmitted(employeeId, me, data);

  redirect(`/admin/employee/${employeeId}?travelSent=1`);
}
