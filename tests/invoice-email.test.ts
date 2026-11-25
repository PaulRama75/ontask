import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------- in-memory DB ----------
type U = { id: string; email: string; name: string; role: string; active: boolean; receivesInvoiceAdminEmails: boolean };
const db: { users: U[]; invoices: any[] } = { users: [], invoices: [] };
let me: U | null = null;

const matchUser = (u: U, w: any = {}) =>
  Object.entries(w).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes((u as any)[k]) : (u as any)[k] === v));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: async ({ where }: any) => db.users.filter((u) => matchUser(u, where)),
      findUnique: async ({ where }: any) => db.users.find((u) => u.id === where.id) ?? null,
    },
    invoice: {
      findUnique: async ({ where }: any) => {
        const inv = db.invoices.find((i) => i.id === where.id);
        return inv ? structuredClone(inv) : null;
      },
      update: async ({ where, data }: any) => {
        const inv = db.invoices.find((i) => i.id === where.id);
        Object.assign(inv, data);
        return inv;
      },
    },
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => me }));
vi.mock("@/lib/storage", () => ({ saveInvoiceFile: vi.fn(), getFile: async () => ({ buffer: Buffer.from("PDF") }) }));
vi.mock("@/lib/crypto", () => ({ maskSsn: (x: any) => x, safeDecrypt: (x: any) => x }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("exceljs", () => ({ default: {} }));

// ---------- provider mocks (Resend via fetch, SMTP via nodemailer) ----------
// EMAIL_TEST_PROVIDER=smtp runs every test through the SMTP path instead.
const PROVIDER = process.env.EMAIL_TEST_PROVIDER === "smtp" ? "smtp" : "resend";
vi.mock("nodemailer", async () => {
  const real: any = await vi.importActual("nodemailer");
  return {
    default: {
      createTransport: (opts: any) => {
        const realTransport = LIVE ? real.default.createTransport(opts) : null;
        return {
          sendMail: async (mail: any) => {
            const override = resendScript.shift();
            const r = override ? override(mail) : null;
            if (r instanceof Error) throw r;
            if (r) {
              // Translate the scripted HTTP status into an SMTP failure.
              const status = (r as Response).status;
              throw Object.assign(new Error(`smtp ${status}`), { responseCode: status === 429 ? 421 : 550 });
            }
            if (LIVE) {
              if (!ALLOWED(String(mail.to))) throw new Error(`BLOCKED: refusing to email ${mail.to} in live test`);
              await realTransport.sendMail(mail);
            }
            sent.push({ to: mail.to, subject: mail.subject, html: mail.html, attachments: mail.attachments });
            return { messageId: "x" };
          },
        };
      },
    },
  };
});

// ---------- Resend mock ----------
type Sent = { to: string; subject: string; html: string; attachments?: any[] };
let sent: Sent[] = [];
let resendScript: ((body: any) => Response | Error | null)[] = []; // per-call overrides
// LIVE_EMAIL_TEST=1 → emails really go out through Resend, but ONLY to the
// two test mailboxes below; anything else throws before a request is made.
const LIVE = process.env.LIVE_EMAIL_TEST === "1";
const REAL_KEY = process.env.RESEND_API_KEY;
const REAL_SMTP = { host: process.env.SMTP_HOST, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
const realFetch = globalThis.fetch;
const ALLOWED = (addr: string) => {
  const a = addr.toLowerCase();
  return a === "pitam@ramiscope.us" || /^pitampandey1(\+[a-z0-9]+)?@gmail\.com$/.test(a);
};
globalThis.fetch = vi.fn(async (url: any, init: any) => {
  if (PROVIDER === "smtp") throw new Error("Resend must not be called when SMTP is configured");
  expect(String(url)).toBe("https://api.resend.com/emails");
  const body = JSON.parse(init.body);
  const override = resendScript.shift();
  const r = override ? override(body) : null;
  if (r instanceof Error) throw r;
  if (r) return r;
  if (LIVE) {
    if (!ALLOWED(String(body.to))) throw new Error(`BLOCKED: refusing to email ${body.to} in live test`);
    const res = await realFetch(url, init);
    if (res.ok) sent.push(body);
    else console.error("[live] Resend rejected", body.to, res.status, await res.clone().text());
    return res;
  }
  sent.push(body);
  return new Response(JSON.stringify({ id: "x" }), { status: 200 });
}) as any;

if (LIVE && PROVIDER === "resend" && !REAL_KEY) throw new Error("LIVE_EMAIL_TEST needs RESEND_API_KEY (and EMAIL_FROM) in .env");
if (LIVE && PROVIDER === "smtp" && !(REAL_SMTP.host && REAL_SMTP.user && REAL_SMTP.pass))
  throw new Error("LIVE_EMAIL_TEST with EMAIL_TEST_PROVIDER=smtp needs SMTP_HOST, SMTP_USER, SMTP_PASS (and SMTP_FROM) in .env");
const A = await import("@/app/admin/invoices/actions");

// The two addresses Purnima asked to use (plus Gmail "+" aliases of the second, same mailbox).
const PM = "pitam@ramiscope.us";
const AM = "pitampandey1@gmail.com";
const ADMIN = "pitampandey1+admin@gmail.com";
const ADMIN2 = "pitampandey1+admin2@gmail.com";
const CLIENT = "pitampandey1+client@gmail.com";

const user = (id: string, email: string, role: string, extra: Partial<U> = {}): U => ({
  id, email, name: id, role, active: true, receivesInvoiceAdminEmails: false, ...extra,
});
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const to = (subjectPart: string) => sent.filter((s) => s.subject.includes(subjectPart)).map((s) => s.to).sort();

beforeEach(() => {
  if (PROVIDER === "smtp") {
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = LIVE ? REAL_SMTP.host : "smtp.test";
    process.env.SMTP_USER = LIVE ? REAL_SMTP.user : "u";
    process.env.SMTP_PASS = LIVE ? REAL_SMTP.pass : "p";
  } else {
    delete process.env.SMTP_HOST;
    process.env.RESEND_API_KEY = LIVE ? REAL_KEY : "test-key";
  }
  process.env.APP_BASE_URL = "https://app.example";
  sent = []; resendScript = [];
  db.users = [user("pm", PM, "PROJECT_MANAGER"), user("am", AM, "ACCOUNT_MANAGER"), user("ad", ADMIN, "ADMIN"), user("ad2", ADMIN2, "SUPER_ADMIN")];
  db.invoices = [{
    id: "inv1", invoiceNumber: "1001", site: "Houston <Plant>", clientName: "Acme", status: "DRAFT",
    createdByUserId: "pm", client: { email: CLIENT, name: "Acme" },
    lineItems: [{ description: "Labor", amount: 1500 }], attachments: [{ fileName: "ts.pdf", storageKey: "k" }],
  }];
});

async function as(id: string, fn: () => Promise<any>) { me = db.users.find((u) => u.id === id)!; return fn(); }

describe("full happy path Submit → AM → Admin → Sent", () => {
  it("sends the right emails at every step, creator gets Sent email", async () => {
    expect(await as("pm", () => A.submitInvoice(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("SUBMITTED");
    expect(to("ready for review")).toEqual([AM]);

    expect(await as("am", () => A.approveInvoice(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("AM_APPROVED");
    expect(to("ready for final approval")).toEqual([ADMIN, ADMIN2].sort());
    expect(to("approved by the Account Manager")).toEqual([PM]);

    expect(await as("ad", () => A.approveInvoiceFinal(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("ADMIN_APPROVED");
    expect(to("Invoice approved —")).toEqual([PM, AM].sort());

    expect(await as("ad", () => A.sendInvoiceToClient(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("SENT");
    expect(db.invoices[0].sentAt).toBeInstanceOf(Date);
    const clientMail = sent.find((s) => s.to === CLIENT)!;
    expect(clientMail.attachments).toHaveLength(1);
    expect(to("Your invoice was sent to the client")).toEqual([PM]);
    expect(to("Invoice sent to client —")).toEqual([AM]);
    // Total recipients across the flow, and nobody outside the test list.
    expect(new Set(sent.map((s) => s.to))).toEqual(new Set([PM, AM, ADMIN, ADMIN2, CLIENT]));
  });

  it("every workflow email has invoice number, escaped site and Open invoice link", async () => {
    await as("pm", () => A.submitInvoice(fd({ invoiceId: "inv1" })));
    const m = sent[0];
    expect(m.subject).toContain("#1001");
    expect(m.html).toContain("Houston &lt;Plant&gt;");
    expect(m.html).not.toContain("<Plant>");
    expect(m.html).toContain("https://app.example/admin/invoices/inv1");
  });

  it("Admin sending directly from AM_APPROVED still reaches SENT and emails creator", async () => {
    db.invoices[0].status = "AM_APPROVED";
    expect(await as("ad", () => A.sendInvoiceToClient(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("SENT");
    expect(to("Your invoice was sent")).toEqual([PM]);
  });
});

const mockOnly = LIVE ? describe.skip : describe;

mockOnly("recipient lookup", () => {
  it("designated invoice admin gets admin emails alone", async () => {
    db.users.find((u) => u.id === "ad2")!.receivesInvoiceAdminEmails = true;
    db.invoices[0].status = "SUBMITTED";
    await as("am", () => A.approveInvoice(fd({ invoiceId: "inv1" })));
    expect(to("ready for final approval")).toEqual([ADMIN2]);
  });
  it("no active Account Manager → submit email goes to admins", async () => {
    db.users.find((u) => u.id === "am")!.active = false;
    await as("pm", () => A.submitInvoice(fd({ invoiceId: "inv1" })));
    expect(to("ready for review")).toEqual([ADMIN, ADMIN2].sort());
  });
  it("inactive creator gets nothing, others still notified", async () => {
    db.invoices[0].status = "ADMIN_APPROVED";
    db.users.find((u) => u.id === "pm")!.active = false;
    await as("ad", () => A.sendInvoiceToClient(fd({ invoiceId: "inv1" })));
    expect(to("Your invoice was sent")).toEqual([]);
    expect(to("Invoice sent to client —")).toEqual([AM]);
  });
  it("actor is not emailed about their own action; no duplicate emails", async () => {
    // Admin created the invoice and also approves it.
    db.invoices[0].createdByUserId = "ad";
    db.invoices[0].status = "AM_APPROVED";
    db.users.push(user("am2", AM.toUpperCase(), "ACCOUNT_MANAGER")); // same mailbox, different case
    await as("ad", () => A.approveInvoiceFinal(fd({ invoiceId: "inv1" })));
    expect(to("Invoice approved —")).toEqual([AM.toLowerCase()]);
  });
  it("creator who is also AM gets the Sent email once", async () => {
    db.invoices[0].createdByUserId = "am";
    db.invoices[0].status = "ADMIN_APPROVED";
    await as("ad", () => A.sendInvoiceToClient(fd({ invoiceId: "inv1" })));
    expect(sent.filter((s) => s.to === AM)).toHaveLength(1);
  });
});

describe("reject / reply", () => {
  it("AM rejects → creator emailed with reason, back to DRAFT; reply goes to rejector", async () => {
    db.invoices[0].status = "SUBMITTED";
    expect(await as("am", () => A.rejectInvoice(fd({ invoiceId: "inv1", reason: "Wrong <hours>" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("DRAFT");
    expect(to("Invoice rejected")).toEqual([PM]);
    expect(sent[0].html).toContain("Wrong &lt;hours&gt;");
    await as("pm", () => A.replyToRejection(fd({ invoiceId: "inv1", message: "fixed" })));
    expect(to("Reply —")).toEqual([AM]);
  });
  it("Admin rejects at AM_APPROVED → creator emailed", async () => {
    db.invoices[0].status = "AM_APPROVED";
    await as("ad", () => A.rejectInvoice(fd({ invoiceId: "inv1", reason: "x" })));
    expect(to("Invoice rejected")).toEqual([PM]);
  });
});

mockOnly("delivery failures", () => {
  it("Resend 429 is retried and the email still arrives", async () => {
    resendScript = [() => new Response("rate", { status: 429, headers: { "retry-after": "0" } })];
    await as("pm", () => A.submitInvoice(fd({ invoiceId: "inv1" })));
    expect(to("ready for review")).toEqual([AM]);
  });
  it("one recipient permanently failing does not stop the others or the status change", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.invoices[0].status = "SUBMITTED";
    resendScript = [() => new Response("bad", { status: 422 })]; // first admin email rejected
    expect(await as("am", () => A.approveInvoice(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("AM_APPROVED");
    expect(to("ready for final approval")).toHaveLength(1);
    expect(to("approved by the Account Manager")).toEqual([PM]);
  });
  it("network error (fetch throws 3x) does not crash the action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = () => new Error("ECONNRESET");
    resendScript = [boom, boom, boom];
    expect(await as("pm", () => A.submitInvoice(fd({ invoiceId: "inv1" })))).toEqual({ ok: true });
    expect(db.invoices[0].status).toBe("SUBMITTED");
  });
  it("client email failure keeps status ADMIN_APPROVED and nobody is told it was sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.invoices[0].status = "ADMIN_APPROVED";
    resendScript = [() => new Response("bad", { status: 403 })];
    const r = await as("ad", () => A.sendInvoiceToClient(fd({ invoiceId: "inv1" })));
    expect(r.ok).toBe(false);
    expect(db.invoices[0].status).toBe("ADMIN_APPROVED");
    expect(sent).toHaveLength(0);
  });
});

mockOnly("permissions unchanged", () => {
  it("AM cannot give final approval or send; PM cannot approve", async () => {
    db.invoices[0].status = "AM_APPROVED";
    expect((await as("am", () => A.approveInvoiceFinal(fd({ invoiceId: "inv1" })))).ok).toBe(false);
    expect((await as("am", () => A.sendInvoiceToClient(fd({ invoiceId: "inv1" })))).ok).toBe(false);
    db.invoices[0].status = "SUBMITTED";
    expect((await as("pm", () => A.approveInvoice(fd({ invoiceId: "inv1" })))).ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
