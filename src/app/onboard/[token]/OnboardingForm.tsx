"use client";

import { useRef, useState, useTransition } from "react";
import { DOCUMENT_CATEGORIES, US_STATES } from "@/lib/constants";
import { submitOnboarding } from "./actions";

type EmployeeData = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ssn: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  driversLicenseNumber: string | null;
  safetyCouncilId: string | null;
  twicNumber: string | null;
  status: string;
};

type CertRow = { name: string; issuer: string; issued: string; expiry: string };

// Document categories that must have at least one file on record. A file is
// only required in THIS submission if none was uploaded previously, so
// resubmitting to fix one field doesn't force re-uploading everything.
const REQUIRED_DOC_CATEGORIES = new Set(["LICENSE", "SSN"]);

const field =
  "mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 shadow-sm focus:border-cyan-400 focus:ring-cyan-400";
const labelCls = "block text-sm font-medium text-slate-300";

export default function OnboardingForm({
  token,
  employee,
  alreadySubmitted,
  existingDocCategories,
}: {
  token: string;
  employee: EmployeeData;
  alreadySubmitted: boolean;
  existingDocCategories: string[];
}) {
  const [certs, setCerts] = useState<CertRow[]>([
    { name: "", issuer: "", issued: "", expiry: "" },
  ]);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function updateCert(i: number, patch: Partial<CertRow>) {
    setCerts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // Reconfigures a category's file input to open the device camera directly
  // (mobile only — desktop just ignores capture and it's a normal picker).
  function openCamera(key: string) {
    const input = fileRefs.current[key];
    if (!input) return;
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.click();
  }

  function resetAccept(key: string) {
    const input = fileRefs.current[key];
    if (!input) return;
    input.accept = "application/pdf,image/*";
    input.removeAttribute("capture");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitOnboarding(token, form);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <h2 className="text-xl font-semibold text-emerald-300">Thank you!</h2>
        <p className="mt-2 text-emerald-300">
          Your information and documents have been submitted. HR will review your
          onboarding shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {alreadySubmitted && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          This onboarding was already submitted. Submitting again will update your
          information and add any new documents.
        </div>
      )}

      <Section title="Personal Information">
        <Grid>
          <Input name="firstName" label="First name" defaultValue={employee.firstName} required />
          <Input name="lastName" label="Last name" defaultValue={employee.lastName} required />
          <Input name="email" label="Email" type="email" defaultValue={employee.email} required />
          <Input name="phone" label="Phone" defaultValue={employee.phone} required />
          <Input name="ssn" label="Social Security Number" defaultValue={employee.ssn} placeholder="XXX-XX-XXXX" />
          <Input name="driversLicenseNumber" label="Driver's license #" defaultValue={employee.driversLicenseNumber} required />
        </Grid>
      </Section>

      <Section title="Address">
        <Grid>
          <Input name="addressLine1" label="Address line 1" defaultValue={employee.addressLine1} className="sm:col-span-2" required />
          <Input name="addressLine2" label="Address line 2" defaultValue={employee.addressLine2} className="sm:col-span-2" />
          <Input name="city" label="City" defaultValue={employee.city} required />
          <div>
            <label className={labelCls}>
              State <span className="text-rose-400">*</span>
            </label>
            <select name="state" defaultValue={employee.state ?? ""} required className={field}>
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Input name="zip" label="ZIP" defaultValue={employee.zip} required />
        </Grid>
      </Section>

      <Section title="Compliance">
        <Grid>
          <Input name="safetyCouncilId" label="Safety Council ID" defaultValue={employee.safetyCouncilId} />
          <Input name="safetyCouncilExpiry" label="Safety Council expiry" type="date" />
          <Input name="twicNumber" label="TWIC card #" defaultValue={employee.twicNumber} />
          <Input name="twicExpiry" label="TWIC expiry" type="date" />
        </Grid>
      </Section>

      <Section title="Certifications" subtitle="Add each certification you hold.">
        <div className="space-y-3">
          {certs.map((c, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-md border border-white/10 p-3 sm:grid-cols-4">
              <input name="certName" value={c.name} onChange={(e) => updateCert(i, { name: e.target.value })} placeholder="Certification name" className={field} />
              <input name="certIssuer" value={c.issuer} onChange={(e) => updateCert(i, { issuer: e.target.value })} placeholder="Issuer" className={field} />
              <input name="certIssued" type="date" value={c.issued} onChange={(e) => updateCert(i, { issued: e.target.value })} className={field} />
              <div className="flex gap-2">
                <input name="certExpiry" type="date" value={c.expiry} onChange={(e) => updateCert(i, { expiry: e.target.value })} className={field} />
                {certs.length > 1 && (
                  <button type="button" onClick={() => setCerts((r) => r.filter((_, idx) => idx !== i))} className="shrink-0 rounded-md border border-white/10 px-2 text-sm text-slate-400 hover:bg-white/5">✕</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setCerts((r) => [...r, { name: "", issuer: "", issued: "", expiry: "" }])} className="text-sm font-medium text-cyan-400 hover:text-cyan-300">
            + Add certification
          </button>
        </div>
      </Section>

      <Section title="Documents" subtitle="Upload a clear photo or PDF for each. You can attach multiple files per type.">
        <div className="space-y-4">
          {DOCUMENT_CATEGORIES.map((cat) => {
            const isRequired = REQUIRED_DOC_CATEGORIES.has(cat.key);
            const alreadyOnFile = existingDocCategories.includes(cat.key);
            return (
              <div key={cat.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-medium text-slate-300">
                  {cat.label} {isRequired && <span className="text-rose-400">*</span>}
                  {isRequired && alreadyOnFile && (
                    <span className="ml-1 text-xs font-normal text-emerald-400">(on file)</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => {
                      fileRefs.current[cat.key] = el;
                    }}
                    type="file"
                    name={`file_${cat.key}`}
                    multiple
                    required={isRequired && !alreadyOnFile}
                    accept="application/pdf,image/*"
                    onChange={() => resetAccept(cat.key)}
                    className="text-sm text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-300 hover:file:bg-blue-500/25"
                  />
                  <button
                    type="button"
                    onClick={() => openCamera(cat.key)}
                    className="whitespace-nowrap rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
                  >
                    📷 Photo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>
      )}

      <button type="submit" disabled={isPending} className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60">
        {isPending ? "Submitting…" : "Submit onboarding"}
      </button>
    </form>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Input({
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
  required,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        className={field}
      />
    </div>
  );
}
