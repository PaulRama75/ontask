import { prisma } from "./prisma";
import { sendEmail, emailButton } from "./email";

// Fixed recipients requested by the business; env vars let each environment
// (demo, local) point somewhere harmless without a code change.
const IT_EMAIL = process.env.IT_NOTIFY_EMAIL || "IT@ferinspection.com";
const CREDIT_CARD_EMAIL = process.env.CREDIT_CARD_NOTIFY_EMAIL || "paul.rama@ferinspection.com";

const TZ = "America/Chicago";
const EXPIRY_WINDOW_DAYS = 30;

const base = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

type NamedEmployee = { firstName: string | null; lastName: string | null; email?: string | null };

export function fullName(e: NamedEmployee): string {
  return [e.firstName, e.lastName].filter(Boolean).join(" ") || "Unnamed employee";
}

async function safetyRecipients(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: "SAFETY", active: true },
    select: { email: true },
  });
  return users.map((u) => u.email);
}

// Notification failures must never break the action that triggered them.
async function send(to: string[], subject: string, html: string): Promise<void> {
  const recipients = [...new Set(to.map((t) => t.trim()).filter(Boolean))];
  if (recipients.length === 0) {
    console.warn("[notify] no recipients for:", subject);
    return;
  }
  await Promise.all(
    recipients.map(async (r) => {
      try {
        await sendEmail({ to: r, subject, html });
      } catch (err) {
        console.error("[notify] send failed", r, subject, err);
      }
    }),
  );
}

function employeeLink(id: string): string {
  return emailButton(`${base()}/admin/employee/${id}`, "Open employee");
}

// 1. A Project Lead / Project Manager saved the Project Lead details.
export async function notifyProjectLeadDetailsSaved(
  employeeId: string,
  savedBy: { name: string | null; email: string; role: string },
): Promise<void> {
  if (savedBy.role !== "PROJECT_LEAD" && savedBy.role !== "PROJECT_MANAGER") return;
  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) return;
  const who = savedBy.role === "PROJECT_LEAD" ? "Project Lead" : "Project Manager";
  await send(
    await safetyRecipients(),
    `Project Lead details saved: ${fullName(e)}`,
    `<p>${savedBy.name || savedBy.email} (${who}) saved the Project Lead details for <strong>${fullName(e)}</strong>.</p>
<p>Please review the safety requirements (safety equipment, trainings, fit test, site specifics).</p>
${employeeLink(e.id)}`,
  );
}

type Flags = {
  frcNeeded: boolean | null;
  emailNeeded: boolean | null;
  creditCardApproved: boolean | null;
};

// 5, 6, 7. Fires only on a change TO "Yes" -- re-saving an already-Yes value,
// or toggling Yes -> No -> Yes later, is a fresh change and notifies again.
export async function notifyFlagTransitions(
  employeeId: string,
  before: Flags,
  after: Partial<Flags>,
): Promise<void> {
  const turnedYes = (k: keyof Flags) => after[k] === true && before[k] !== true;
  if (!turnedYes("frcNeeded") && !turnedYes("emailNeeded") && !turnedYes("creditCardApproved")) {
    return;
  }
  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) return;
  const name = fullName(e);

  if (turnedYes("frcNeeded")) {
    await send(
      await safetyRecipients(),
      `FRC needed: ${name}`,
      `<p><strong>${name}</strong> needs FRC${e.frcSize ? ` (size ${e.frcSize})` : ""}.</p>${employeeLink(e.id)}`,
    );
  }
  if (turnedYes("emailNeeded")) {
    await send(
      [IT_EMAIL],
      `Company email needed: ${name}`,
      `<p>A company email account is needed for the following employee:</p>
<p>Full name: <strong>${name}</strong><br>Email address: <strong>${e.email || "(none on file)"}</strong></p>`,
    );
  }
  if (turnedYes("creditCardApproved")) {
    await send(
      [CREDIT_CARD_EMAIL],
      `Company credit card approved: ${name}`,
      `<p>A company credit card was approved for <strong>${name}</strong>.</p>${employeeLink(e.id)}`,
    );
  }
}

// ---------- Scheduled notifications (2 and 4) ----------

// Y-M-D for `now` in company time, plus weekday (0=Sun) and hour.
function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

// Claim a notification key exactly once across all app instances.
async function claim(key: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { key } });
    return true;
  } catch {
    return false; // unique violation: someone already sent it
  }
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export type ScheduledResult = { expiryDigest: number; anniversaries: number };

// `force` skips the time-of-day gate and de-duplication so an
// admin (or a test) can trigger a send on demand; `now` lets tests pretend
// it's a different day.
export async function runScheduledNotifications(
  opts: { now?: Date; force?: boolean } = {},
): Promise<ScheduledResult> {
  const now = opts.now ?? new Date();
  const force = !!opts.force;
  const t = localParts(now);
  const todayUtc = Date.UTC(t.year, t.month - 1, t.day);
  const result: ScheduledResult = { expiryDigest: 0, anniversaries: 0 };

  if (force || (t.hour >= 7 && t.hour < 20)) {
    // 2. Safety Council / TWIC expiry reminders. Each card starts notifying
    // once it is within 30 days of expiry, then repeats every 7 days until the
    // expiry date. Cards due on the same day go out in one email.
    const employees = await prisma.employee.findMany({
      where: { archived: false, OR: [{ safetyCouncilExpiry: { not: null } }, { twicExpiry: { not: null } }] },
      select: { id: true, firstName: true, lastName: true, safetyCouncilExpiry: true, twicExpiry: true },
    });
    const daysLeft = (d: Date) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - todayUtc) / 86400000);
    const todayStr = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
    const due: { name: string; card: string; expiry: Date; days: number; key: string }[] = [];
    for (const e of employees) {
      for (const [card, d] of [["Safety Council", e.safetyCouncilExpiry], ["TWIC", e.twicExpiry]] as const) {
        if (!d) continue;
        const days = daysLeft(d);
        if (days < 0 || days > EXPIRY_WINDOW_DAYS) continue;
        // Keys are per card + expiry date, so entering a renewed expiry date starts a fresh cycle.
        const prefix = `expiry:${e.id}:${card}:${fmtDate(d)}:`;
        if (!force) {
          // Key dates are ISO, so the lexically greatest key is the latest send.
          const last = await prisma.notificationLog.findFirst({
            where: { key: { startsWith: prefix } },
            orderBy: { key: "desc" },
            select: { key: true },
          });
          if (last) {
            const [y, m, dd] = last.key.slice(prefix.length).split("-").map(Number);
            if ((todayUtc - Date.UTC(y, m - 1, dd)) / 86400000 < 7) continue;
          }
        }
        due.push({ name: fullName(e), card, expiry: d, days, key: `${prefix}${todayStr}` });
      }
    }
    // Claim each card's send for today; a card another instance already claimed is skipped.
    const send2: typeof due = [];
    for (const r of due) if (force || (await claim(r.key))) send2.push(r);
    if (send2.length > 0) {
      send2.sort((a, b) => a.days - b.days);
      const body = send2
        .map((r) => `<tr><td style="padding:4px 12px 4px 0">${r.name}</td><td style="padding:4px 12px 4px 0">${r.card}</td><td style="padding:4px 12px 4px 0">${fmtDate(r.expiry)}</td><td style="padding:4px 0">${r.days === 0 ? "today" : `${r.days} day${r.days === 1 ? "" : "s"}`}</td></tr>`)
        .join("");
      await send(
        await safetyRecipients(),
        `Expiring Safety Council / TWIC cards (${send2.length})`,
        `<p>These cards are within ${EXPIRY_WINDOW_DAYS} days of expiring:</p>
<table style="border-collapse:collapse;font-size:14px"><thead><tr><th align="left" style="padding:4px 12px 4px 0">Employee</th><th align="left" style="padding:4px 12px 4px 0">Card</th><th align="left" style="padding:4px 12px 4px 0">Expires</th><th align="left">In</th></tr></thead><tbody>${body}</tbody></table>
<p style="font-size:12px;color:#94a3b8">Reminders start ${EXPIRY_WINDOW_DAYS} days before expiry and repeat weekly until the expiry date.</p>`,
      );
      result.expiryDigest = send2.length;
    }

    // 4. Hire-date anniversary -> that employee's Project Lead / Project Manager.
    const hired = await prisma.employee.findMany({
      where: { hireDate: { not: null }, archived: false, active: true },
      select: { id: true, firstName: true, lastName: true, hireDate: true, projectLeadEmail: true, projectManagerEmail: true },
    });
    for (const e of hired) {
      const h = e.hireDate!;
      const years = t.year - h.getUTCFullYear();
      // A Feb 29 hire date is observed on Feb 28 in non-leap years.
      const leapDay = h.getUTCMonth() === 1 && h.getUTCDate() === 29;
      const isLeapYear = new Date(Date.UTC(t.year, 1, 29)).getUTCDate() === 29;
      const annivMonth = h.getUTCMonth() + 1;
      const annivDay = leapDay && !isLeapYear ? 28 : h.getUTCDate();
      if (years < 1 || annivMonth !== t.month || annivDay !== t.day) continue;
      const to = [e.projectLeadEmail, e.projectManagerEmail].filter((x): x is string => !!x);
      if (to.length === 0) continue;
      if (!force && !(await claim(`anniversary:${e.id}:${t.year}`))) continue;
      await send(
        to,
        `Work anniversary today: ${fullName(e)} (${years} year${years === 1 ? "" : "s"})`,
        `<p><strong>${fullName(e)}</strong> reaches ${years} year${years === 1 ? "" : "s"} with FER today (hired ${fmtDate(h)}).</p>${employeeLink(e.id)}`,
      );
      result.anniversaries++;
    }
  }
  return result;
}
