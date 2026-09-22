// Shared Monday-Sunday week math for timesheets. `weekEnding` is always the
// Sunday (matches the source template: Mon 1/2/23 ... Sun 1/8/23, week
// ending 1/8/23). Dates are UTC-midnight so they compare/store cleanly.

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

// Given any date, return that week's Sunday (the week-ending date).
export function weekEndingFor(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const offsetToSunday = day === 0 ? 0 : 7 - day;
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() + offsetToSunday);
  return utcDate(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate());
}

// The 7 calendar dates (Mon..Sun) for a given week-ending Sunday.
export function weekDates(weekEnding: Date): Date[] {
  const out: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(weekEnding);
    d.setUTCDate(weekEnding.getUTCDate() - i);
    out.push(d);
  }
  return out;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
}
