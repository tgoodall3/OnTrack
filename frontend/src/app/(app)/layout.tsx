import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { AppNavigation, MobileNav } from "@/components/navigation/app-navigation";
import { Bell, HelpCircle, Settings } from "lucide-react";
import { PropsWithChildren } from "react";
import { ReactQueryProvider } from "../providers/react-query";
import { ToastContainer } from "@/components/ui/toast-container";

function HeaderActions() {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/notifications"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-surface shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
      </Link>
      <Link
        href="/support"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-surface shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
        aria-label="Support"
      >
        <HelpCircle className="h-4 w-4" />
      </Link>
      <Link
        href="/settings"
        className="hidden h-10 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold transition hover:border-primary/60 hover:text-primary sm:flex"
      >
        <Settings className="mr-2 h-4 w-4" />
        Settings
      </Link>
      <Link
        href="/account"
        className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-left text-sm font-medium transition hover:border-primary/60 hover:text-primary"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          JD
        </span>
        <span className="hidden sm:flex sm:flex-col">
          <span>Jordan Diaz</span>
          <span className="text-xs text-muted-foreground">Operations Lead</span>
        </span>
      </Link>
    </div>
  );
}

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <ReactQueryProvider>
      <div className="relative flex min-h-screen flex-col bg-background text-foreground">
        <ToastContainer />
        <header className="glass-panel border-b border-border/60">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <Logo />
              <MobileNav />
            </div>
            <div className="hidden md:block">
              {/* <AppNavigation /> */}
            </div>
            <HeaderActions />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pb-8 pt-6 md:px-6 lg:pb-12">
          <aside className="sticky top-24 hidden h-fit w-60 shrink-0 rounded-3xl border border-border/80 bg-surface/95 p-4 shadow-lg shadow-primary/5 md:block">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace
            </div>
            <AppNavigation />
            <div className="mt-6 rounded-2xl bg-primary/6 p-4 text-sm text-muted-foreground">
              <p className="mb-2 font-semibold text-primary">Need help?</p>
              <p>Open a support ticket or call OnTrack concierge anytime.</p>
              <Link
                href="/support"
                className="mt-3 inline-flex items-center text-primary underline-offset-4 hover:underline"
              >
                Visit Support Center
              </Link>
            </div>
          </aside>

          <main className="flex-1">
            <div className="rounded-3xl border border-border/60 bg-surface/95 p-6 shadow-lg shadow-primary/10 md:p-10">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ReactQueryProvider>
  );
}
