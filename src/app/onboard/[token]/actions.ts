"use server";

import { prisma } from "@/lib/prisma";
import { saveFile } from "@/lib/storage";
import { sendEmail } from "@/lib/email";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { revalidatePath } from "next/cache";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function dateOrNull(form: FormData, key: string): Date | null {
  const v = str(form, key);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitOnboarding(
  token: string,
  form: FormData,
): Promise<SubmitResult> {
  const link = await prisma.onboardingLink.findUnique({
    where: { token },
    include: { employee: true },
  });
  if (!link) return { ok: false, error: "Invalid or expired link." };

  const employeeId = link.employeeId;
  const employeeName = [str(form, "firstName"), str(form, "lastName")]
    .filter(Boolean)
    .join(" ");

  // Server-side enforcement of required fields (the client's `required`
  // attributes are a UX hint only, not real validation, since a form can
  // always be submitted programmatically).
  const missing: string[] = [];
  if (!str(form, "phone")) missing.push("Phone");
  if (!str(form, "addressLine1")) missing.push("Address line 1");
  if (!str(form, "city")) missing.push("City");
  if (!str(form, "state")) missing.push("State");
  if (!str(form, "zip")) missing.push("ZIP");
  if (!str(form, "driversLicenseNumber")) missing.push("Driver's license #");

  // Driver's License and Social Security Card documents: required unless
  // one is already on file from a previous submission.
  const REQUIRED_DOC_CATEGORIES: { key: string; label: string }[] = [
    { key: "LICENSE", label: "Driver's License document" },
    { key: "SSN", label: "Social Security Card document" },
  ];
  const existingRequiredDocs = await prisma.document.findMany({
    where: { employeeId, category: { in: REQUIRED_DOC_CATEGORIES.map((c) => c.key) } },
    select: { category: true },
  });
  const hasExisting = (cat: string) => existingRequiredDocs.some((d) => d.category === cat);
  for (const cat of REQUIRED_DOC_CATEGORIES) {
    const hasNewFile = form
      .getAll(`file_${cat.key}`)
      .some((f) => f instanceof File && f.size > 0);
    if (!hasNewFile && !hasExisting(cat.key)) missing.push(cat.label);
  }

  if (missing.length > 0) {
    return { ok: false, error: `Please provide: ${missing.join(", ")}.` };
  }

  // 1) Save the core employee data.
  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      firstName: str(form, "firstName"),
      lastName: str(form, "lastName"),
      email: str(form, "email"),
      phone: str(form, "phone"),
      ssn: str(form, "ssn"),
      addressLine1: str(form, "addressLine1"),
      addressLine2: str(form, "addressLine2"),
      city: str(form, "city"),
      state: str(form, "state"),
      zip: str(form, "zip"),
      driversLicenseNumber: str(form, "driversLicenseNumber"),
      safetyCouncilId: str(form, "safetyCouncilId"),
      safetyCouncilExpiry: dateOrNull(form, "safetyCouncilExpiry"),
      twicNumber: str(form, "twicNumber"),
      twicExpiry: dateOrNull(form, "twicExpiry"),
      status: "SUBMITTED",
    },
  });

  // 2) Replace certifications with the submitted set.
  const certNames = form.getAll("certName").map((v) => String(v).trim());
  const certIssuers = form.getAll("certIssuer").map((v) => String(v).trim());
  const certIssued = form.getAll("certIssued").map((v) => String(v).trim());
  const certExpiry = form.getAll("certExpiry").map((v) => String(v).trim());

  await prisma.certification.deleteMany({ where: { employeeId } });
  const certs = certNames
    .map((name, i) => ({
      employeeId,
      name,
      issuer: certIssuers[i] || null,
      issuedDate: certIssued[i] ? new Date(certIssued[i]) : null,
      expiryDate: certExpiry[i] ? new Date(certExpiry[i]) : null,
    }))
    .filter((c) => c.name.length > 0);
  if (certs.length) await prisma.certification.createMany({ data: certs });

  // 3) Handle uploaded files. Field name pattern: file_<CATEGORY>.
  const categories = DOCUMENT_CATEGORIES.map((c) => c.key);
  for (const cat of categories) {
    const files = form.getAll(`file_${cat}`).filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return { ok: false, error: `"${file.name}" exceeds the 15 MB limit.` };
      }
      if (file.type && !ALLOWED_MIME.has(file.type)) {
        return { ok: false, error: `"${file.name}" must be a PDF or image.` };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveFile(buffer, file.name, {
        employeeName,
        employeeId,
        category: cat,
      });
      await prisma.document.create({
        data: {
          employeeId,
          category: cat,
          label: file.name,
          fileName: file.name,
          storageKey: saved.storageKey,
          mimeType: file.type || "application/octet-stream",
          size: saved.size,
        },
      });
    }
  }

  await prisma.onboardingLink.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  // 4) Notify the assigned Project Lead and all HR (stubbed unless RESEND_API_KEY set).
  // Recipients = every active HR user, the Project Lead chosen on this employee's
  // onboarding link, plus the optional HR_NOTIFY_EMAIL env (backward compatibility).
  const hrUsers = await prisma.user.findMany({
    where: { active: true, role: "HR" },
    select: { email: true },
  });
  const recipients = new Set<string>();
  for (const u of hrUsers) {
    if (u.email) recipients.add(u.email);
  }
  if (link.employee.projectLeadEmail) recipients.add(link.employee.projectLeadEmail);
  if (process.env.HR_NOTIFY_EMAIL) recipients.add(process.env.HR_NOTIFY_EMAIL);

  if (recipients.size > 0) {
    const who = employeeName || "A new employee";
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const subject = `Onboarding submitted: ${who}`;
    const html = `<p>${who} completed onboarding and is ready for review.</p>
<p><a href="${base}/admin/grid">Open the employee data grid</a></p>`;
    await Promise.all(
      [...recipients].map((to) => sendEmail({ to, subject, html })),
    );
  }

  revalidatePath(`/onboard/${token}`);
  return { ok: true };
}
