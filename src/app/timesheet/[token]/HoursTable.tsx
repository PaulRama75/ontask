"use client";

import { useState } from "react";

// The billable-time grid on the employee's timesheet. Each day starts with one
// line; "+ Split" adds another line for the same date so the day's hours can
// be charged to a different FER Job #. Field names carry the day and line
// index (e.g. stHours_2_1) and lineCount_<day> tells the server how many.

export const LINE_FIELDS = [
  "jobNumber",
  "woNumber",
  "details",
  "stHours",
  "otHours",
  "ptoHours",
  "vacationHours",
  "holidayHours",
  "perDiem",
  "mileageDriven",
  "mileageAmount",
] as const;
type Field = (typeof LINE_FIELDS)[number];
export type Line = Record<Field, string>;

const MAX_LINES = 6; // keep in sync with MAX_LINES_PER_DAY in actions.ts

const inputCls =
  "w-full rounded border border-white/10 bg-slate-800/60 px-1.5 py-1 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400";
const th = "px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap";
const td = "px-1 py-1 align-top";

const emptyLine = (): Line =>
  Object.fromEntries(LINE_FIELDS.map((f) => [f, ""])) as Line;

const NUMBER_FIELDS: { field: Field; step: string }[] = [
  { field: "stHours", step: "0.25" },
  { field: "otHours", step: "0.25" },
  { field: "ptoHours", step: "0.25" },
  { field: "vacationHours", step: "0.25" },
  { field: "holidayHours", step: "0.25" },
  { field: "perDiem", step: "0.01" },
  { field: "mileageDriven", step: "0.1" },
  { field: "mileageAmount", step: "0.01" },
];

function total(days: Line[][], field: Field): number {
  return days.flat().reduce((s, l) => s + (Number(l[field]) || 0), 0);
}
const money = (v: number) => `$${v.toFixed(2)}`;
const hrs = (v: number) => String(Math.round(v * 100) / 100);

export default function HoursTable({
  days: dayInfo,
  initial,
  weekJobNumber,
}: {
  days: { label: string; date: string }[];
  initial: Line[][];
  weekJobNumber: string;
}) {
  const [days, setDays] = useState<Line[][]>(() =>
    dayInfo.map((_, i) => (initial[i]?.length ? initial[i] : [emptyLine()])),
  );

  const update = (i: number, k: number, field: Field, value: string) =>
    setDays((prev) => prev.map((lines, di) => (di !== i ? lines : lines.map((l, li) => (li !== k ? l : { ...l, [field]: value })))));
  const addLine = (i: number) =>
    setDays((prev) => prev.map((lines, di) => (di !== i || lines.length >= MAX_LINES ? lines : [...lines, emptyLine()])));
  const removeLine = (i: number, k: number) =>
    setDays((prev) => prev.map((lines, di) => (di !== i ? lines : lines.filter((_, li) => li !== k))));

  const jobPlaceholder = weekJobNumber || "Job #";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className={th}>Day</th>
            <th className={th}>Date</th>
            <th className={th}>FER Job #</th>
            <th className={th}>WO#</th>
            <th className={th}>Details</th>
            <th className={th}>ST Hrs</th>
            <th className={th}>OT Hrs</th>
            <th className={th}>PTO</th>
            <th className={th}>Vacation</th>
            <th className={th}>Holiday</th>
            <th className={th}>Per Diem</th>
            <th className={th}>Miles</th>
            <th className={th}>Mileage $</th>
          </tr>
        </thead>
        <tbody>
          {dayInfo.map((day, i) => {
            const lines = days[i];
            return lines.map((l, k) => {
              const last = k === lines.length - 1;
              return (
                <tr key={`${i}-${k}`} className={last ? "border-b border-white/5" : ""}>
                  <td className={`${td} whitespace-nowrap`}>
                    {k === 0 ? (
                      <>
                        {day.label}
                        <input type="hidden" name={`lineCount_${i}`} value={lines.length} />
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-500">
                        ↳ split
                        <button
                          type="button"
                          onClick={() => removeLine(i, k)}
                          aria-label={`Remove this split line for ${day.label}`}
                          title="Remove this split line"
                          className="rounded px-1 text-rose-300 hover:bg-rose-500/10"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {last && lines.length < MAX_LINES && (
                      <button
                        type="button"
                        onClick={() => addLine(i)}
                        title="Split this day across another FER Job #"
                        className="mt-1 block text-[10px] font-semibold text-cyan-400 hover:underline"
                      >
                        + Split
                      </button>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-slate-400`}>{k === 0 ? day.date : ""}</td>
                  <td className={td}>
                    <input
                      name={`jobNumber_${i}_${k}`}
                      value={l.jobNumber}
                      onChange={(e) => update(i, k, "jobNumber", e.target.value)}
                      placeholder={jobPlaceholder}
                      aria-label={`FER Job # for ${day.label}${k ? ` split ${k}` : ""}`}
                      className={`${inputCls} min-w-[92px]`}
                    />
                  </td>
                  <td className={td}>
                    <input
                      name={`woNumber_${i}_${k}`}
                      value={l.woNumber}
                      onChange={(e) => update(i, k, "woNumber", e.target.value)}
                      className={inputCls}
                    />
                  </td>
                  <td className={td}>
                    <input
                      name={`details_${i}_${k}`}
                      value={l.details}
                      onChange={(e) => update(i, k, "details", e.target.value)}
                      className={`${inputCls} min-w-[140px]`}
                    />
                  </td>
                  {NUMBER_FIELDS.map(({ field, step }) => (
                    <td key={field} className={td}>
                      <input
                        type="number"
                        step={step}
                        min="0"
                        name={`${field}_${i}_${k}`}
                        value={l[field]}
                        onChange={(e) => update(i, k, field, e.target.value)}
                        className={`${inputCls} w-16`}
                      />
                    </td>
                  ))}
                </tr>
              );
            });
          })}
          <tr className="font-semibold text-slate-200">
            <td className={td} colSpan={5}>TOTAL</td>
            <td className={td}>{hrs(total(days, "stHours"))}</td>
            <td className={td}>{hrs(total(days, "otHours"))}</td>
            <td className={td}>{hrs(total(days, "ptoHours"))}</td>
            <td className={td}>{hrs(total(days, "vacationHours"))}</td>
            <td className={td}>{hrs(total(days, "holidayHours"))}</td>
            <td className={td}>{money(total(days, "perDiem"))}</td>
            <td className={td}>{hrs(total(days, "mileageDriven"))}</td>
            <td className={td}>{money(total(days, "mileageAmount"))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
