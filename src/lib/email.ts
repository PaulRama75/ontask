// Pluggable email layer. Phase 1: console stub unless RESEND_API_KEY is set.
// Phase 3 wires real HR / Project Lead notification triggers.

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

// Returns true if the email was sent (or stubbed in dev), false if a real send failed.
export async function sendEmail({ to, subject, html, attachments }: SendArgs): Promise<boolean> {
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

  // Resend HTTP API (no SDK dependency needed).
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, ...(attachments ? { attachments } : {}) }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] send failed", res.status, body);
    return false;
  }
  return true;
}
