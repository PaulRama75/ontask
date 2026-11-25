import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("../src/lib/prisma", () => ({ prisma: {} }));

import { annualReviewDue } from "../src/lib/notifications";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const day = (s: string) => d(s).getTime();

describe("annualReviewDue (reminder 30 days before each hire-date anniversary)", () => {
  it("is due exactly 30 days before the anniversary", () => {
    const r = annualReviewDue(d("2023-12-25"), day("2026-11-25"));
    expect(r).toEqual({ anniversary: d("2026-12-25"), years: 3, daysLeft: 30 });
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
    const r = annualReviewDue(d("2020-01-10"), day("2026-12-20"));
    expect(r).toEqual({ anniversary: d("2027-01-10"), years: 7, daysLeft: 21 });
  });

  it("skips the hire year itself (first review is at 1 year)", () => {
    expect(annualReviewDue(d("2026-12-10"), day("2026-11-25"))).toBeNull();
    expect(annualReviewDue(d("2025-12-10"), day("2026-11-25"))?.years).toBe(1);
  });

  it("observes a Feb 29 hire date on Feb 28 in non-leap years", () => {
    const r = annualReviewDue(d("2024-02-29"), day("2027-01-29"));
    expect(r).toEqual({ anniversary: d("2027-02-28"), years: 3, daysLeft: 30 });
  });
});
