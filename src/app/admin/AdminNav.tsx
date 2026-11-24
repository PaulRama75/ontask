"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <nav className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap px-1 pb-1 text-sm [scrollbar-width:none] lg:order-none lg:w-auto lg:overflow-visible lg:pb-0">
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
  );
}
