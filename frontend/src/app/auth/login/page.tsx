"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface/80 px-6 py-5 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-primary">
            OnTrack
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm font-semibold text-primary transition hover:text-accent-foreground"
          >
            Create account
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-12 md:flex-row">
        <div className="md:w-1/2">
          <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
            Run your crews, finances, and client updates from a single platform.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            OnTrack keeps estimators, crew leads, and clients aligned with real-time updates, approvals, and progress
            photos.
          </p>
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p>• Sync schedules, purchase orders, and field checklists in moments.</p>
            <p>• Accelerate approvals with client portals and automated reminders.</p>
            <p>• Push finalized jobs directly to billing with Stripe-powered payments.</p>
          </div>
        </div>
        <div className="md:w-1/2">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-xl shadow-primary/10">
            <h2 className="text-xl font-semibold text-foreground">Sign in to OnTrack</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your work email to receive a secure magic link.
            </p>

            <form className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="mt-2 w-full rounded-2xl border border-border/80 bg-background px-4 py-3 text-sm shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:bg-primary/90"
              >
                Send magic link
              </button>
            </form>

            <div className="mt-6 text-xs text-muted-foreground">
              By continuing you agree to the OnTrack Terms of Service and acknowledge the Privacy Policy.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
