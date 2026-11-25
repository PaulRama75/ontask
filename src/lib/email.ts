import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Pluggable email layer. Provider is picked from the environment:
//   1. SMTP (e.g. Brevo smtp-relay.brevo.com, same no-reply setup as
//      RAMISCOPE) when SMTP_HOST, SMTP_USER and SMTP_PASS are set;
//   2. Resend HTTP API when RESEND_API_KEY is set;
//   3. otherwise a console stub (local dev).

// A button-styled CTA link for transactional emails. Inline styles only —
// email clients ignore <style> blocks and most external CSS.
export function emailButton(url: string, label: string): string {
  return `<p style="margin:24px 0;">
  <a href="${url}" style="display:inline-block;padding:12px 24px;background:linear-gradient(90deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;">${label}</a>
</p>
<p style="font-size:12px;color:#94a3b8;">Or paste this link into your browser: ${url}</p>`;
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[]; // content = base64
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Returns true if the email was sent (or stubbed in dev), false if a real send
// failed. Never throws: a network error or a Resend rejection is logged and
// reported as false, so callers sending to several people don't abort halfway.
// Rate-limit (429) and transient 5xx responses are retried with backoff --
// Resend caps requests per second, and back-to-back workflow emails (one per
// Account Manager / Admin) used to hit that cap and get silently dropped.
export async function sendEmail(args: SendArgs): Promise<boolean> {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return sendViaSmtp(args);
  return sendViaResend(args);
}

// One pooled transport per process (rebuilt if the settings change).
let smtp: { key: string; transport: Transporter } | null = null;
function smtpTransport(): Transporter {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER!;
  const key = `${host}:${port}:${user}`;
  if (!smtp || smtp.key !== key) {
    smtp = {
      key,
      transport: nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 587/2525 use STARTTLS
        auth: { user, pass: process.env.SMTP_PASS! },
        pool: true,
        maxConnections: 2,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return smtp.transport;
}

// SMTP reply codes 4xx are temporary (rate limit, busy); connection errors
// have no code. Both are worth a retry; 5xx (bad address, auth) is not.
function smtpRetryable(err: unknown): boolean {
  const code = (err as { responseCode?: number })?.responseCode;
  return code === undefined || (code >= 400 && code < 500);
}

async function sendViaSmtp({ to, subject, html, attachments }: SendArgs): Promise<boolean> {
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER!;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await smtpTransport().sendMail({
        from,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content, encoding: "base64" })),
      });
      return true;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && smtpRetryable(err)) {
        await sleep(600 * attempt);
        continue;
      }
      console.error("[email] smtp send failed", { to, subject }, err);
      return false;
    }
  }
  return false;
}

async function sendViaResend({ to, subject, html, attachments }: SendArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@fer.local";

  if (!key) {
    console.log("[email:stub] would send ->", {
      to,
      from,
      subject,
      attachmentCount: attachments?.length ?? 0,
    });
    return true;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Resend HTTP API (no SDK dependency needed).
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html, ...(attachments ? { attachments } : {}) }),
      });
      if (res.ok) return true;

      const body = await res.text();
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 * attempt);
        continue;
      }
      console.error("[email] send failed", { to, subject, status: res.status, body });
      return false;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(600 * attempt);
        continue;
      }
      console.error("[email] send threw", { to, subject }, err);
      return false;
    }
  }
  return false;
}
