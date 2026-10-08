"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PinDialog, { type PinConfirmResult } from "./PinDialog";
import type { GatedResult } from "@/lib/gatedResult";

// Replacement for ConfirmSubmitButton on PIN-gated destructive/sensitive
// actions. Instead of submitting a <form>, it opens the shared PinDialog
// (keeping the prior confirm() text as the dialog description), collects a
// PIN, builds a FormData from `fields` + any rendered `inputs` + a hidden
// `pin`, and invokes the gated server `action` programmatically. It then
// reads the returned GatedResult: pinRequired -> the dialog's forced-setup
// CTA; error -> inline retry; ok -> close and let revalidation refresh (or
// navigate to `successHref`, e.g. deleteInvoice -> /admin/invoices).
//
// `inputs` lets a caller carry user-typed values (e.g. a rejection reason):
// they render inside this component's own (never-submitted) form and are read
// back as FormData at confirm time, so dynamic values are captured correctly.
export default function PinConfirmButton({
  action,
  fields,
  inputs,
  confirmMessage,
  successHref,
  className,
  title = "Confirm with your security PIN",
  children,
}: {
  action: (form: FormData) => Promise<GatedResult>;
  fields?: Record<string, string>;
  inputs?: React.ReactNode;
  confirmMessage: string;
  successHref?: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function openDialog() {
    // Mirror the native `required` validation the plain forms had, so an
    // empty required input (e.g. a rejection reason) blocks the dialog.
    if (formRef.current && !formRef.current.reportValidity()) return;
    setOpen(true);
  }

  async function onConfirm(pin: string): Promise<PinConfirmResult> {
    const form = formRef.current ? new FormData(formRef.current) : new FormData();
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        form.set(key, value);
      }
    }
    form.set("pin", pin);

    const res = await action(form);
    if (res.ok) {
      setOpen(false);
      if (successHref) {
        router.push(successHref);
      }
      // Otherwise the action's revalidatePath refreshes the current view.
      return { ok: true };
    }
    if (res.pinRequired) {
      return { ok: false, pinRequired: true };
    }
    return { ok: false, error: res.error };
  }

  return (
    <>
      {/* This form is never submitted -- it only groups inputs so their
          typed values can be read into FormData at confirm time. */}
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2">
        {inputs}
        <button type="button" onClick={openDialog} className={className}>
          {children}
        </button>
      </form>
      <PinDialog
        open={open}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        title={title}
        description={confirmMessage}
      />
    </>
  );
}
