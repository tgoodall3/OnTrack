"use client";

import {
  BarChart3,
  Bell,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FolderOpen,
  HardHat,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Settings,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  { label: "Crew", href: "/crew", icon: HardHat },
  { label: "Checklists", href: "/checklists", icon: ClipboardCheck },
  { label: "Schedule", href: "/schedule", icon: CalendarCheck },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Files", href: "/files", icon: FolderOpen },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

const MOBILE_ACTIONS = [
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Support", href: "/support", icon: HelpCircle },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Account", href: "/account", icon: User },
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
  const activeItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [open]);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 rounded-full border border-border/70 bg-surface px-3 py-1.5 text-left text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/80 hover:text-primary"
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Navigate</span>
          <span>{activeItem?.label ?? "Select a page"}</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && mounted
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[2147483000] bg-background/70 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div
                id="mobile-nav-menu"
                className="fixed inset-x-4 top-24 z-[2147483600] max-h-[75vh] overflow-y-auto rounded-3xl border border-border/70 bg-surface p-4 shadow-2xl shadow-primary/20 sm:inset-x-auto sm:right-6 sm:w-[360px] sm:top-28"
                aria-modal="true"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick navigation</p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-border/70 p-1.5 text-muted-foreground transition hover:border-primary/70 hover:text-primary"
                    aria-label="Close navigation menu"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-4 rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      JD
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Jordan Diaz</p>
                      <p className="text-xs text-muted-foreground">Operations Lead</p>
                    </div>
                  </div>
                  <Link
                    href="/account"
                    className="mt-3 inline-flex items-center text-xs font-semibold uppercase tracking-wide text-primary underline-offset-4 hover:underline"
                  >
                    Manage profile
                  </Link>
                </div>
                <nav className="mt-4 grid gap-2 text-sm font-medium">
                  {NAV_ITEMS.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition ${
                          isActive
                            ? "border-primary/80 bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                            : "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <div className="flex-1">
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="ml-2 rounded-full bg-background/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-5 space-y-2 rounded-2xl border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                    Workspace actions
                  </p>
                  <div className="grid gap-2">
                    {MOBILE_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link
                          key={action.href}
                          href={action.href}
                          className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-foreground transition hover:border-border hover:bg-muted/60"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <span>{action.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
