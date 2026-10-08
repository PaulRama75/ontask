"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateName, changePassword, setPin } from "./actions";

const inputClass =
  "mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400";
const buttonClass =
  "mt-6 w-full rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] hover:shadow-cyan-500/40 disabled:scale-100 disabled:opacity-60";
const cardClass =
  "mt-6 rounded-xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur";

function ErrorBox({ error }: { error: string }) {
  return (
    <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-300">
      {error}
    </p>
  );
}

function SuccessBox({ message }: { message: string }) {
  return (
    <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm text-emerald-300">
      {message}
    </p>
  );
}

export default function ProfileForms({
  email,
  role,
  name,
  hasPin,
}: {
  email: string;
  role: string;
  name: string | null;
  hasPin: boolean;
}) {
  const [nameState, nameAction, namePending] = useActionState(updateName, undefined);
  const [pwState, pwAction, pwPending] = useActionState(changePassword, undefined);
  const [pinState, pinAction, pinPending] = useActionState(setPin, undefined);

  const pinSectionRef = useRef<HTMLElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.hash === "#pin") {
      pinSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      pinInputRef.current?.focus();
    }
  }, []);

  return (
    <div>
      {/* Account (read-only) + name */}
      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-white">Account</h2>

        <div className="mt-4 flex items-center justify-between border-b border-white/5 py-2">
          <span className="text-sm text-slate-400">Email</span>
          <span className="text-sm text-white">{email}</span>
        </div>
        <div className="flex items-center justify-between border-b border-white/5 py-2">
          <span className="text-sm text-slate-400">Role</span>
          <span className="text-sm text-white">{role}</span>
        </div>

        <form action={nameAction} className="mt-4">
          <label className="block text-sm font-medium text-slate-300">Name</label>
          <input name="name" type="text" defaultValue={name ?? ""} maxLength={200} className={inputClass} />

          {nameState?.ok === false && <ErrorBox error={nameState.error} />}
          {nameState?.ok === true && <SuccessBox message="Name updated." />}

          <button type="submit" disabled={namePending} className={buttonClass}>
            {namePending ? "Saving…" : "Save name"}
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-white">Change password</h2>

        <form action={pwAction}>
          <label className="mt-4 block text-sm font-medium text-slate-300">Current password</label>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            className={inputClass}
          />

          <label className="mt-4 block text-sm font-medium text-slate-300">New password</label>
          <input name="newPassword" type="password" autoComplete="new-password" className={inputClass} />

          <label className="mt-4 block text-sm font-medium text-slate-300">Confirm new password</label>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />

          {pwState?.ok === false && <ErrorBox error={pwState.error} />}
          {pwState?.ok === true && <SuccessBox message="Password changed." />}

          <button type="submit" disabled={pwPending} className={buttonClass}>
            {pwPending ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>

      {/* Set / change PIN */}
      <section id="pin" ref={pinSectionRef} className={cardClass}>
        <h2 className="text-lg font-semibold text-white">Security PIN</h2>
        <p className="mt-1 text-sm text-slate-400">
          {hasPin
            ? "A security PIN is set. It gates downloads and destructive actions."
            : "Set a 4 to 6 digit PIN to protect downloads and destructive actions."}
        </p>

        <form action={pinAction}>
          <input type="hidden" name="credentialKind" value={hasPin ? "pin" : "password"} />

          <label className="mt-4 block text-sm font-medium text-slate-300">
            {hasPin ? "Current password or PIN" : "Current password"}
          </label>
          <input
            name="currentCredential"
            type="password"
            autoComplete="off"
            className={inputClass}
          />

          <label className="mt-4 block text-sm font-medium text-slate-300">New PIN</label>
          <input
            ref={pinInputRef}
            name="newPin"
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            maxLength={6}
            autoComplete="off"
            className={inputClass}
          />

          <label className="mt-4 block text-sm font-medium text-slate-300">Confirm new PIN</label>
          <input
            name="confirmPin"
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            maxLength={6}
            autoComplete="off"
            className={inputClass}
          />

          {pinState?.ok === false && <ErrorBox error={pinState.error} />}
          {pinState?.ok === true && <SuccessBox message="PIN is set." />}

          <button type="submit" disabled={pinPending} className={buttonClass}>
            {pinPending ? "Saving…" : hasPin ? "Change PIN" : "Set PIN"}
          </button>
        </form>
      </section>
    </div>
  );
}
