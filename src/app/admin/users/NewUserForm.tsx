"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { UserActionResult } from "./actions";

type RoleChoice = { key: string; label: string };
type CreateRoleResult = { ok: boolean; error?: string; role?: { key: string; label: string; status: string } };

const fieldClass =
  "w-full rounded-md border border-white/10 bg-slate-800/60 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-400";
const primaryBtn =
  "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500 disabled:opacity-60";
const cancelBtn =
  "rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-60";

// "Create user" button that opens a popup with the new-user form.
// Submitting calls the same createUser server action as before.
// The small "+" next to Role opens a second popup to add a new role.
export default function NewUserForm({
  action,
  createRoleAction,
  roles,
}: {
  action: (form: FormData) => Promise<UserActionResult>;
  createRoleAction: (form: FormData) => Promise<CreateRoleResult>;
  roles: RoleChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [roleList, setRoleList] = useState<RoleChoice[]>(roles);
  const [role, setRole] = useState("HR");

  const [roleOpen, setRoleOpen] = useState(false);
  const [rolePending, startRoleTransition] = useTransition();
  const [roleError, setRoleError] = useState<string | null>(null);

  // Keep the list in sync when the server sends a fresh one.
  useEffect(() => {
    setRoleList((prev) => roles.concat(prev.filter((r) => !roles.some((x) => x.key === r.key))));
  }, [roles]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (roleOpen) {
        if (!rolePending) setRoleOpen(false);
      } else if (!pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, roleOpen, rolePending]);

  function openModal() {
    setError(null);
    setDone(false);
    setOpen(true);
  }

  function closeModal() {
    if (pending) return;
    setOpen(false);
    setRoleOpen(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const form = new FormData(e.currentTarget);
    const el = e.currentTarget;
    startTransition(async () => {
      const res = await action(form);
      if (res.ok) {
        setDone(true);
        el.reset();
        setRole("HR");
        setOpen(false);
      } else {
        setError(res.error ?? "Could not create user.");
      }
    });
  }

  function onRoleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setRoleError(null);
    const form = new FormData(e.currentTarget);
    startRoleTransition(async () => {
      const res = await createRoleAction(form);
      if (res.ok && res.role) {
        const added = { key: res.role.key, label: res.role.label };
        if (res.role.status === "ACTIVE") {
          setRoleList((prev) => (prev.some((r) => r.key === added.key) ? prev : [...prev, added]));
          setRole(added.key);
        }
        setRoleOpen(false);
      } else {
        setRoleError(res.error ?? "Could not add role.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {done && <span className="text-xs text-emerald-400">User created.</span>}
        <button
          type="button"
          onClick={openModal}
          className="rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-blue-700/40 ring-1 ring-sky-300/30 transition hover:from-sky-400 hover:to-blue-500"
        >
          + Create user
        </button>
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Create user"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-base font-semibold text-white">Create user</h2>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close"
                  className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={onSubmit} className="space-y-3 px-4 py-4">
                <div>
                  <label className={labelClass} htmlFor="nu-name">Name</label>
                  <input id="nu-name" name="name" placeholder="Name" autoFocus className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="nu-email">Email</label>
                  <input id="nu-email" name="email" type="email" placeholder="Email" required className={fieldClass} />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="block text-xs font-medium text-slate-400" htmlFor="nu-role">Role</label>
                    <button
                      type="button"
                      onClick={() => {
                        setRoleError(null);
                        setRoleOpen(true);
                      }}
                      title="Add new role"
                      aria-label="Add new role"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-sky-500 to-blue-600 text-sm font-bold leading-none text-white shadow shadow-blue-900/50 ring-1 ring-sky-300/30 transition hover:scale-110"
                    >
                      +
                    </button>
                  </div>
                  <select id="nu-role" name="role" value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
                    {roleList.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="nu-password">Password</label>
                  <input id="nu-password" name="password" type="text" placeholder="Temp password (8+ chars)" required className={fieldClass} />
                </div>
                {error && <p className="text-sm text-rose-400">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={closeModal} disabled={pending} className={cancelBtn}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pending} className={primaryBtn}>
                    {pending ? "Creating…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {open &&
        roleOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Add new role"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !rolePending) setRoleOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-xl border border-sky-400/20 bg-slate-900 shadow-2xl shadow-black/60">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-base font-semibold text-white">Add new role</h2>
                <button
                  type="button"
                  onClick={() => !rolePending && setRoleOpen(false)}
                  aria-label="Close"
                  className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={onRoleSubmit} className="space-y-3 px-4 py-4">
                <div>
                  <label className={labelClass} htmlFor="nr-name">Role name</label>
                  <input id="nr-name" name="roleName" placeholder="e.g. Site Supervisor" required maxLength={50} autoFocus className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="nr-status">Status</label>
                  <select id="nr-status" name="status" defaultValue="ACTIVE" className={fieldClass}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                {roleError && <p className="text-sm text-rose-400">{roleError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setRoleOpen(false)} disabled={rolePending} className={cancelBtn}>
                    Cancel
                  </button>
                  <button type="submit" disabled={rolePending} className={primaryBtn}>
                    {rolePending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
