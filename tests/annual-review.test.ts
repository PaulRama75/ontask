import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- In-memory stand-ins for the database and the email provider ----------

type Emp = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  hireDate: Date | null;
  projectManagerEmail: string | null;
  projectLeadEmail?: string | null;
  active: boolean;
  archived: boolean;
};

const db = vi.hoisted(() => ({
  employees: [] as Emp[],
  log: new Set<string>(),
  sent: [] as { to: string; subject: string; html: string }[],
  failSend: false,
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    employee: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.OR) return []; // the Safety Council / TWIC expiry query: not under test here
        return db.employees.filter(
          (e) =>
            e.hireDate !== null &&
            (where.archived === undefined || e.archived === where.archived) &&
            (where.active === undefined || e.active === where.active),
        );
      },
    },
    user: { findMany: async () => [] },
    notificationLog: {
      create: async ({ data }: { data: { key: string } }) => {
        if (db.log.has(data.key)) throw new Error("Unique constraint failed");
        db.log.add(data.key);
        return data;
      },
      findFirst: async () => null,
      deleteMany: async ({ where }: { where: { key: string } }) => {
        db.log.delete(where.key);
        return { count: 1 };
      },
    },
  },
}));

vi.mock("../src/lib/email", () => ({
  emailButton: (url: string, label: string) => `<a href="${url}">${label}</a>`,
  sendEmail: async (a: { to: string; subject: string; html: string }) => {
    if (db.failSend) return false;
    db.sent.push(a);
    return true;
  },
}));

import { annualReviewDue, runScheduledNotifications } from "../src/lib/notifications";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const day = (s: string) => d(s).getTime();
// 15:00 UTC = 9 AM in Chicago, inside the 7 AM - 8 PM sending window.
const at = (s: string, hourUtc = 15) => new Date(`${s}T${String(hourUtc).padStart(2, "0")}:00:00Z`);
const addDays = (s: string, n: number) => new Date(day(s) + n * 86400000).toISOString().slice(0, 10);

function emp(over: Partial<Emp> = {}): Emp {
  return {
    id: "e1",
    firstName: "Rahim",
    lastName: "Uddin",
    hireDate: d("2023-12-25"),
    projectManagerEmail: "pm@fer.test",
    projectLeadEmail: "pl@fer.test",
    active: true,
    archived: false,
    ...over,
  };
}

beforeEach(() => {
  db.employees = [];
  db.log.clear();
  db.sent = [];
  db.failSend = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------- Date logic ----------

describe("annualReviewDue (reminder 30 days before each hire-date anniversary)", () => {
  it("is due exactly 30 days before the anniversary", () => {
    expect(annualReviewDue(d("2023-12-25"), day("2026-11-25"))).toEqual({
      anniversary: d("2026-12-25"),
      years: 3,
      daysLeft: 30,
    });
  });

  it("is not due 31 days before", () => {
    expect(annualReviewDue(d("2023-12-26"), day("2026-11-25"))).toBeNull();
  });

  it("still catches up inside the window if a day was missed", () => {
    expect(annualReviewDue(d("2023-12-10"), day("2026-11-25"))?.daysLeft).toBe(15);
  });

  it("is not due on the anniversary itself or after it", () => {
    expect(annualReviewDue(d("2023-11-25"), day("2026-11-25"))).toBeNull();
    expect(annualReviewDue(d("2023-11-20"), day("2026-11-25"))).toBeNull();
  });

  it("crosses the year boundary", () => {
    expect(annualReviewDue(d("2020-01-10"), day("2026-12-20"))).toEqual({
      anniversary: d("2027-01-10"),
      years: 7,
      daysLeft: 21,
    });
  });

  it("skips the hire year itself (first review is at 1 year)", () => {
    expect(annualReviewDue(d("2026-12-10"), day("2026-11-25"))).toBeNull();
    expect(annualReviewDue(d("2025-12-10"), day("2026-11-25"))?.years).toBe(1);
  });

  it("observes a Feb 29 hire date on Feb 28 in non-leap years", () => {
    expect(annualReviewDue(d("2024-02-29"), day("2027-01-29"))).toEqual({
      anniversary: d("2027-02-28"),
      years: 3,
      daysLeft: 30,
    });
  });

  it("uses Feb 29 itself in leap years", () => {
    expect(annualReviewDue(d("2024-02-29"), day("2028-01-30"))?.anniversary).toEqual(d("2028-02-29"));
  });
});

// ---------- Full scheduled job ----------

describe("runScheduledNotifications: annual review email", () => {
  it("emails only the Project Manager, 30 days before, with the right details", async () => {
    db.employees = [emp()];
    const r = await runScheduledNotifications({ now: at("2026-11-25") });
    expect(r.anniversaries).toBe(1);
    expect(db.sent).toHaveLength(1);
    expect(db.sent[0].to).toBe("pm@fer.test"); // not the Project Lead
    expect(db.sent[0].subject).toBe("Annual review due 2026-12-25: Rahim Uddin (3 years)");
    expect(db.sent[0].html).toContain("hired 2023-12-25");
    expect(db.sent[0].html).toContain("30 days from now");
    expect(db.sent[0].html).toContain("/admin/employee/e1");
  });

  it("sends nothing 31 days before", async () => {
    db.employees = [emp()];
    await runScheduledNotifications({ now: at("2026-11-24") });
    expect(db.sent).toHaveLength(0);
  });

  it("sends only once even though the job runs every hour, every day", async () => {
    db.employees = [emp()];
    for (let i = 0; i < 30; i++) {
      for (const h of [13, 15, 18, 22]) await runScheduledNotifications({ now: at(addDays("2026-11-25", i), h) });
    }
    expect(db.sent).toHaveLength(1);
  });

  it("over a whole year of daily runs, sends exactly one email, on anniversary minus 30 days", async () => {
    db.employees = [emp()];
    const sentOn: string[] = [];
    for (let i = 0; i < 366; i++) {
      const today = addDays("2026-06-01", i);
      const before = db.sent.length;
      await runScheduledNotifications({ now: at(today) });
      if (db.sent.length > before) sentOn.push(today);
    }
    expect(sentOn).toEqual(["2026-11-25"]);
  });

  it("sends again for the next year's anniversary", async () => {
    db.employees = [emp()];
    await runScheduledNotifications({ now: at("2026-11-25") });
    await runScheduledNotifications({ now: at("2027-11-25") });
    expect(db.sent.map((s) => s.subject)).toEqual([
      "Annual review due 2026-12-25: Rahim Uddin (3 years)",
      "Annual review due 2027-12-25: Rahim Uddin (4 years)",
    ]);
  });

  it("does not send outside 7 AM - 8 PM Chicago time, then sends later the same day", async () => {
    db.employees = [emp()];
    await runScheduledNotifications({ now: at("2026-11-25", 11) }); // 5 AM Chicago
    expect(db.sent).toHaveLength(0);
    await runScheduledNotifications({ now: at("2026-11-25", 14) }); // 8 AM Chicago
    expect(db.sent).toHaveLength(1);
  });

  it("catches up if the server was down on the 30-day mark", async () => {
    db.employees = [emp()];
    await runScheduledNotifications({ now: at("2026-11-28") });
    expect(db.sent).toHaveLength(1);
    expect(db.sent[0].html).toContain("27 days from now");
  });

  it("skips an employee with no Project Manager, without emailing anyone else", async () => {
    db.employees = [emp({ projectManagerEmail: null }), emp({ id: "e2", projectManagerEmail: "   " })];
    const r = await runScheduledNotifications({ now: at("2026-11-25") });
    expect(r.anniversaries).toBe(0);
    expect(db.sent).toHaveLength(0);
    expect(db.log.size).toBe(0); // nothing marked as sent
  });

  it("sends once a PM is added later inside the window", async () => {
    db.employees = [emp({ projectManagerEmail: null })];
    await runScheduledNotifications({ now: at("2026-11-25") });
    db.employees[0].projectManagerEmail = "pm@fer.test";
    await runScheduledNotifications({ now: at("2026-11-26") });
    expect(db.sent).toHaveLength(1);
    expect(db.sent[0].to).toBe("pm@fer.test");
  });

  it("skips archived and inactive employees", async () => {
    db.employees = [emp({ archived: true }), emp({ id: "e2", active: false })];
    await runScheduledNotifications({ now: at("2026-11-25") });
    expect(db.sent).toHaveLength(0);
  });

  it("retries on the next run if the email failed, and still sends only once", async () => {
    db.employees = [emp()];
    db.failSend = true;
    const r1 = await runScheduledNotifications({ now: at("2026-11-25", 15) });
    expect(r1.anniversaries).toBe(0);
    expect(db.log.size).toBe(0); // failed send not marked done
    db.failSend = false;
    await runScheduledNotifications({ now: at("2026-11-25", 16) });
    await runScheduledNotifications({ now: at("2026-11-25", 17) });
    expect(db.sent).toHaveLength(1);
  });

  it("each employee gets their own reminder to their own PM", async () => {
    db.employees = [
      emp(),
      emp({ id: "e2", firstName: "Karim", hireDate: d("2021-12-25"), projectManagerEmail: "pm2@fer.test" }),
      emp({ id: "e3", firstName: "Not", lastName: "Due", hireDate: d("2021-03-01"), projectManagerEmail: "pm3@fer.test" }),
    ];
    await runScheduledNotifications({ now: at("2026-11-25") });
    expect(db.sent.map((s) => [s.to, s.subject])).toEqual([
      ["pm@fer.test", "Annual review due 2026-12-25: Rahim Uddin (3 years)"],
      ["pm2@fer.test", "Annual review due 2026-12-25: Karim Uddin (5 years)"],
    ]);
  });

  it("force=1 (manual trigger) sends even if already sent", async () => {
    db.employees = [emp()];
    await runScheduledNotifications({ now: at("2026-11-25") });
    await runScheduledNotifications({ now: at("2026-11-25"), force: true });
    expect(db.sent).toHaveLength(2);
  });
});
