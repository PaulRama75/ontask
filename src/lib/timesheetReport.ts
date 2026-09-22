import { prisma } from "./prisma";
import { isAssignedProjectLeadOrManager } from "./rbac";

export type TimesheetFilters = {
  employeeId?: string;
  jobNumbers?: string[];
  from?: Date;
  to?: Date;
};

export type ReportDay = Awaited<ReturnType<typeof fetchTimesheetDays>>[number];

// A Project Lead/Manager only ever sees days for employees created by or
// assigned to them (same scope as the data grid); every other role that can
// reach this report sees everyone.
export async function scopedEmployeeIds(me: { id: string; role: string; email: string }): Promise<string[] | null> {
  if (me.role !== "PROJECT_LEAD" && me.role !== "PROJECT_MANAGER") return null;
  const mine = await prisma.employee.findMany({
    where: {
      OR: [
        { projectLeadEmail: { equals: me.email, mode: "insensitive" } },
        { projectManagerEmail: { equals: me.email, mode: "insensitive" } },
        { createdById: me.id },
      ],
    },
    select: { id: true },
  });
  return mine.map((e) => e.id);
}

export async function fetchTimesheetDays(
  me: { id: string; role: string; email: string },
  filters: TimesheetFilters,
) {
  const scope = await scopedEmployeeIds(me);
  const employeeIdFilter = filters.employeeId
    ? scope
      ? scope.includes(filters.employeeId)
        ? [filters.employeeId]
        : ["__none__"]
      : [filters.employeeId]
    : scope;

  const jobNumberClause = filters.jobNumbers && filters.jobNumbers.length > 0
    ? {
        OR: [
          { jobNumber: { in: filters.jobNumbers } },
          { jobNumber: null, timesheet: { jobNumber: { in: filters.jobNumbers } } },
        ],
      }
    : {};

  return prisma.timesheetDay.findMany({
    where: {
      ...jobNumberClause,
      date: {
        gte: filters.from,
        lte: filters.to,
      },
      timesheet: {
        ...(employeeIdFilter ? { employeeId: { in: employeeIdFilter } } : {}),
      },
    },
    include: {
      timesheet: {
        include: { employee: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
    orderBy: { date: "desc" },
  });
}

export type EmployeeSummary = {
  employeeId: string;
  name: string;
  days: number;
  stHours: number;
  otHours: number;
  ptoHours: number;
  vacationHours: number;
  holidayHours: number;
  perDiem: number;
  mileageDriven: number;
  mileageAmount: number;
  expenses: number;
};

export function summarizeByEmployee(rows: ReportDay[]): EmployeeSummary[] {
  const map = new Map<string, EmployeeSummary>();
  for (const r of rows) {
    const emp = r.timesheet.employee;
    const name = [emp.firstName, emp.lastName].filter(Boolean).join(" ") || emp.email || emp.id;
    const s = map.get(emp.id) ?? {
      employeeId: emp.id,
      name,
      days: 0,
      stHours: 0,
      otHours: 0,
      ptoHours: 0,
      vacationHours: 0,
      holidayHours: 0,
      perDiem: 0,
      mileageDriven: 0,
      mileageAmount: 0,
      expenses: 0,
    };
    s.days += 1;
    s.stHours += r.stHours ?? 0;
    s.otHours += r.otHours ?? 0;
    s.ptoHours += r.ptoHours ?? 0;
    s.vacationHours += r.vacationHours ?? 0;
    s.holidayHours += r.holidayHours ?? 0;
    s.perDiem += r.perDiem ?? 0;
    s.mileageDriven += r.mileageDriven ?? 0;
    s.mileageAmount += r.mileageAmount ?? 0;
    s.expenses +=
      (r.lodging ?? 0) + (r.meals ?? 0) + (r.airfare ?? 0) + (r.fuel ?? 0) +
      (r.carRental ?? 0) + (r.gasoline ?? 0) + (r.parking ?? 0) + (r.misc ?? 0);
    map.set(emp.id, s);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
