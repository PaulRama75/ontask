"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
 * Global "LOADING..." overlay (same look as the ramifront loader).
 * It is shown while:
 *  - an in-app link / menu item is clicked, until the new page arrives
 *  - a server action (form submit, button action) is running
 *  - a router navigation / refresh request is in flight
 *  - a normal (non-JS) form is submitted
 * It only watches events; it does not change any page logic.
 * To skip it for one element/form, add the attribute data-no-loader.
 */

// Set for a moment when a form inside [data-no-loader] submits, so its
// server-action request does not show the overlay.
let skipActionUntil = 0;

const SHOW_DELAY_MS = 120; // avoid a flash for very fast responses
const MAX_SHOW_MS = 30000; // safety: never stay stuck forever

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  try {
    if (headers instanceof Headers) return headers.get(name);
    if (Array.isArray(headers)) {
      const hit = headers.find(([k]) => k.toLowerCase() === name);
      return hit ? hit[1] : null;
    }
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === name) return (headers as Record<string, string>)[k];
    }
  } catch {}
  return null;
}

function isTrackedRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (headerValue(headers, "next-action")) return Date.now() > skipActionUntil; // server action
  // RSC navigation / router.refresh(), but not background prefetches
  if (headerValue(headers, "rsc") && !headerValue(headers, "next-router-prefetch")) return true;
  return false;
}

function shouldHandleLink(a: HTMLAnchorElement, e: MouseEvent): boolean {
  // Note: next/link always calls preventDefault (client-side navigation), so
  // defaultPrevented is not checked here.
  if (a.closest("[data-no-loader]")) return false;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.hasAttribute("download")) return false;
  const target = a.getAttribute("target");
  if (target && target !== "_self") return false;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return false;
  let url: URL;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false; // file downloads / exports
  if (/\.(pdf|xlsx?|csv|zip|docx?|png|jpe?g)$/i.test(url.pathname)) return false;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return false; // same page / hash link
  return true;
}

function Tracker({ setNav }: { setNav: (v: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams?.toString() ?? ""}`;
  useEffect(() => {
    setNav(false); // new page arrived
  }, [key, setNav]);
  return null;
}

export function LoaderOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
    >
      <div className="flex w-[200px] flex-col items-center gap-5 rounded-2xl bg-black px-6 pb-6 pt-8 shadow-2xl shadow-black/60 ring-1 ring-white/10">
        <div className="relative h-[124px] w-[124px]">
          <div className="absolute inset-0 rounded-full border-[3px] border-white/15" />
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-sky-400 border-r-sky-400/60 [animation-duration:1.1s]" />
          <div className="absolute inset-[10px] flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-slate-800 to-slate-950 ring-2 ring-white/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoblack.png" alt="FER" className="w-[72%] select-none" draggable={false} />
          </div>
        </div>
        <p className="text-xs font-medium tracking-[0.25em] text-slate-400">LOADING...</p>
      </div>
    </div>
  );
}

export default function PageLoader() {
  const [nav, setNav] = useState(false);
  const [pending, setPending] = useState(0);
  const [visible, setVisible] = useState(false);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Link / menu clicks and plain form submits
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      const a = el?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      // let other handlers run first (they may call preventDefault)
      setTimeout(() => {
        if (shouldHandleLink(a, e)) setNav(true);
      }, 0);
    };
    const onSubmitCapture = (e: SubmitEvent) => {
      const form = e.target as HTMLElement | null;
      if (form?.closest?.("[data-no-loader]")) skipActionUntil = Date.now() + 300;
    };
    const onSubmit = (e: SubmitEvent) => {
      setTimeout(() => {
        if (e.defaultPrevented) return; // React server-action forms are handled by the fetch watcher
        const form = e.target as HTMLFormElement;
        if (form.closest("[data-no-loader]")) return;
        const submitter = e.submitter as HTMLButtonElement | HTMLInputElement | null;
        const action = submitter?.getAttribute("formaction") ?? form.getAttribute("action") ?? "";
        if (action.startsWith("javascript:")) return;
        if (form.getAttribute("target") && form.getAttribute("target") !== "_self") return;
        if (action.includes("/api/")) return; // downloads
        setNav(true);
      }, 0);
    };
    const onPageShow = () => setNav(false); // back/forward cache
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmitCapture, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmitCapture, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // Server actions and router navigations go through fetch
  useEffect(() => {
    const original = window.fetch;
    const patched: typeof window.fetch = (input, init) => {
      let tracked = false;
      try {
        tracked = isTrackedRequest(input, init);
      } catch {}
      if (!tracked) return original(input, init);
      setPending((n) => n + 1);
      const done = () => setPending((n) => Math.max(0, n - 1));
      return original(input, init).then(
        (res) => {
          done();
          return res;
        },
        (err) => {
          done();
          throw err;
        },
      );
    };
    window.fetch = patched;
    return () => {
      if (window.fetch === patched) window.fetch = original;
    };
  }, []);

  // Safety: never keep the overlay forever
  useEffect(() => {
    if (!nav) return;
    navTimer.current = setTimeout(() => setNav(false), MAX_SHOW_MS);
    return () => {
      if (navTimer.current) clearTimeout(navTimer.current);
    };
  }, [nav]);

  const active = nav || pending > 0;
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <>
      <Suspense fallback={null}>
        <Tracker setNav={setNav} />
      </Suspense>
      {visible ? <LoaderOverlay /> : null}
    </>
  );
}
