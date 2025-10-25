"use client";

import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type AppNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const NAV_ITEMS: AppNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Estimates", href: "/estimates", icon: ClipboardList },
  { label: "Work", href: "/work", icon: ClipboardList },
  { label: "Schedule", href: "/schedule", icon: CalendarCheck },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Files", href: "/files", icon: FolderOpen },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

export function AppNavigation() {
  const pathname = usePathname();
  return (
    <nav className="hidden flex-col gap-1 text-sm font-medium md:flex">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2 transition ${
              isActive
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon
              className={`h-4 w-4 transition ${
                isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
              }`}
            />
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto rounded-full bg-accent/90 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/80 hover:text-primary"
      >
        Menu
        <span className="text-xs text-muted-foreground">
          {NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Navigate"}
        </span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col rounded-2xl border border-border bg-surface p-2 shadow-xl shadow-primary/10">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
