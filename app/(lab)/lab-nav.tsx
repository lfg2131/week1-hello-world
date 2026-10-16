"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/explore", label: "Explore" },
  { href: "/rate", label: "Rate" },
  { href: "/create", label: "Create" },
] as const;

export function LabNav() {
  const pathname = usePathname();
  return (
    // Phones: the tabs share the header row's free width equally. Larger screens: natural width.
    <nav aria-label="Main" className="flex min-w-0 flex-1 rounded-2xl border border-line bg-surface p-1 sm:flex-none">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-xl px-2 text-sm font-semibold transition sm:flex-none sm:px-4 ${active ? "bg-white text-zinc-950 shadow-sm" : "text-muted hover:bg-white/5 hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
