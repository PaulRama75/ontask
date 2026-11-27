"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Item = { key: string; label: string; href: string };

// Which nav item a path belongs to. "/admin" (Onboarding) only matches exactly;
// employee detail pages sit under Onboarding, their travel page under Travel Requests.
function activeKey(pathname: string, items: Item[]): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return items.find((i) => i.href === "/admin")?.key ?? null;
  if (/^\/admin\/employee\/[^/]+\/travel(\/|$)/.test(path)) {
    const t = items.find((i) => i.href === "/admin/travel-requests");
    if (t) return t.key;
  }
  if (path.startsWith("/admin/employee")) {
    return items.find((i) => i.href === "/admin")?.key ?? null;
  }
  let best: Item | null = null;
  for (const i of items) {
    if (i.href === "/admin") continue;
    if (path === i.href || path.startsWith(i.href + "/")) {
      if (!best || i.href.length > best.href.length) best = i;
    }
  }
  return best?.key ?? null;
}

export default function AdminNav({ items }: { items: Item[] }) {
  const pathname = usePathname() ?? "";
  const current = activeKey(pathname, items);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // While the drawer is open: Esc closes it, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Mobile/tablet drawer. Rendered into <body> because the sticky header uses
  // backdrop-blur, which would otherwise trap position:fixed inside the header.
  const drawer = (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={() => setOpen(false)}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        id="admin-mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#0b1629] shadow-2xl shadow-black/60 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300/90">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-sky-400/[0.08] hover:text-white"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 text-sm">
          {items.map((item) => {
            const active = item.key === current;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "mb-1 block rounded-lg bg-gradient-to-b from-blue-500/25 to-blue-700/20 px-3 py-2.5 font-medium text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.35)]"
                    : "mb-1 block rounded-lg px-3 py-2.5 text-slate-300 transition-colors hover:bg-sky-400/[0.08] hover:text-white"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );

  return (
    <>
    {/* Mobile/tablet (below lg): hamburger button, shown before the logo. */}
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      aria-expanded={open}
      aria-controls="admin-mobile-nav"
      className="order-first -ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-sky-400/[0.08] hover:text-white lg:hidden"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
      </svg>
    </button>
    {mounted ? createPortal(drawer, document.body) : null}

    {/* Desktop (lg and up): the same top menu as before. */}
    <nav className="-mx-1 hidden w-auto items-center gap-1 whitespace-nowrap px-1 text-sm lg:flex">
      {items.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "relative shrink-0 rounded-lg bg-gradient-to-b from-blue-500/25 to-blue-700/20 px-3 py-1.5 font-medium text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.35)] shadow-blue-900/40 after:absolute after:inset-x-3 after:-bottom-[13px] after:hidden after:h-0.5 after:rounded-full after:bg-sky-400 after:content-[''] lg:after:block"
                : "shrink-0 rounded-lg px-3 py-1.5 text-slate-400 transition-colors hover:bg-sky-400/[0.08] hover:text-white"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
    </>
  );
}
