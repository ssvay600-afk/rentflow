"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/payouts", label: "Get paid" },
  { href: "/dashboard/reminders", label: "AI Reminders" },
  { href: "/dashboard/bot", label: "Support Bot" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Nav({ badges }: { badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map((l) => {
        const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
        const count = badges[l.href];
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              active ? "bg-teal-50 font-medium text-teal-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
            {count ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
