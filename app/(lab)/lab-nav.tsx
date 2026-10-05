"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/rate", label: "Rate" },
  { href: "/create", label: "Create" },
] as const;

export function LabNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex rounded-2xl border border-line bg-surface p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold transition ${active ? "bg-white text-zinc-950" : "text-muted hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
