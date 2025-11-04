"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  Coins,
  MapPin,
  Timer,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type DashboardMetrics = {
  jobs: {
    active: number;
    upcomingVisits: number;
    crewUtilization: number;
    pendingApprovals: number;
  };
  pipeline: {
    newLeads: number;
    estimatesSent: number;
    approved: number;
    jobsScheduled: number;
    tasksCompleted: number;
    tasksPending: number;
    pipelineValue: number;
  };
  nextVisits: Array<{
    id: string;
    title: string;
    address: string;
    scheduledAt: string;
    crewName: string;
    status: string;
  }>;
};

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Dashboard request failed: ${response.status}`);
  }

  return response.json();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function greetingForDate(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery<DashboardMetrics, Error>({
    queryKey: ["dashboard", "summary"],
    queryFn: fetchDashboardMetrics,
  });

  const now = useMemo(() => new Date(), []);
  const heroVisit = metrics?.nextVisits?.[0];
  const upcomingVisits = metrics?.nextVisits ?? [];
  const crewGreetingName = heroVisit?.crewName?.split(" ")[0] ?? "team";

  const metricCards = useMemo(
    () => [
      {
        label: "Active Jobs",
        value: metrics ? metrics.jobs.active.toString() : "—",
        trend: metrics ? `${metrics.jobs.upcomingVisits} scheduled visits` : "Awaiting data",
        icon: ClipboardCheck,
      },
      {
        label: "Crew Utilization",
        value: metrics ? `${metrics.jobs.crewUtilization}%` : "—",
        trend:
          metrics && metrics.jobs.crewUtilization > 90
            ? "High load"
            : metrics
              ? "Within target"
              : "Awaiting data",
        icon: Users,
      },
      {
        label: "Pending Approvals",
        value: metrics ? metrics.jobs.pendingApprovals.toString() : "—",
        trend:
          metrics && metrics.jobs.pendingApprovals > 0
            ? "Needs supervisor review"
            : metrics
              ? "All entries approved"
              : "Awaiting data",
        icon: Timer,
      },
      {
        label: "Pipeline Value",
        value: metrics ? formatCurrency(metrics.pipeline.pipelineValue) : "—",
        trend: metrics
          ? `${metrics.pipeline.jobsScheduled} jobs scheduled in the last 7 days`
          : "Awaiting data",
        icon: Coins,
      },
      {
        label: "New Leads",
        value: metrics ? metrics.pipeline.newLeads.toString() : "—",
        trend: metrics ? `${metrics.pipeline.estimatesSent} estimates sent` : "Awaiting data",
        icon: CalendarClock,
      },
    ],
    [metrics],
  );

  const pipeline = useMemo(
    () => [
      {
        stage: "New Leads",
        total: metrics?.pipeline.newLeads ?? 0,
        highlight: metrics ? "Created in the past 7 days" : "Awaiting data",
      },
      {
        stage: "Estimates Sent",
        total: metrics?.pipeline.estimatesSent ?? 0,
        highlight: metrics
          ? `${Math.max(metrics.pipeline.estimatesSent - metrics.pipeline.approved, 0)} awaiting approval`
          : "Awaiting data",
      },
      {
        stage: "Jobs Scheduled",
        total: metrics?.pipeline.jobsScheduled ?? 0,
        highlight: heroVisit
          ? `Next visit ${formatDateTime(heroVisit.scheduledAt)}`
          : metrics
            ? "Converted jobs in the last 7 days"
            : "Next open slot pending",
      },
      {
        stage: "Tasks Completed",
        total: metrics?.pipeline.tasksCompleted ?? 0,
        highlight: metrics
          ? `${metrics.pipeline.tasksPending} remaining`
          : "Awaiting data",
      },
    ],
    [metrics, heroVisit],
  );

  return (
    <div className="page-stack">
      <section className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-primary/92 via-primary to-primary/80 p-7 text-primary-foreground shadow-lg shadow-primary/30 md:flex-row md:items-center md:justify-between md:p-10 ">
        <div className="space-y-3">
          <span className="inline-flex items-center rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-semibold uppercase">
            {formatShortDate(now)}
          </span>
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
            {greetingForDate(now)}, {crewGreetingName}.
            <br className="hidden sm:inline" />
            {heroVisit ? `${heroVisit.status} — ${heroVisit.title}` : "Stay on track with live operations."}
          </h1>
          <p className="max-w-xl text-primary-foreground/80">
            {heroVisit
              ? `Next visit starts ${formatDateTime(heroVisit.scheduledAt)} at ${heroVisit.address}.`
              : "Pull job progress, crew scheduling, and pipeline momentum in one glance."}
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-primary-foreground/90">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1 font-medium">
              <ChevronRight className="h-4 w-4" />
              {metrics ? `${metrics.jobs.active} jobs in motion` : "Jobs update once data loads"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1 font-medium">
              <ChevronRight className="h-4 w-4" />
              {metrics ? `Pipeline at ${formatCurrency(metrics.pipeline.pipelineValue)}` : "Pipeline syncing"}
            </span>
          </div>
        </div>
        <div className="rounded-3xl bg-primary-foreground/10 p-5">
          <p className="text-sm uppercase tracking-wide text-primary-foreground/70">Upcoming Visit</p>
          <div className="mt-3 space-y-2">
            <p className="text-2xl font-semibold">{heroVisit ? heroVisit.title : "Awaiting schedule"}</p>
            <p className="text-primary-foreground/70">
              {heroVisit
                ? `${formatDateTime(heroVisit.scheduledAt)} · ${heroVisit.crewName}`
                : "Once visits are scheduled, details appear here."}
            </p>
            {heroVisit && <p className="text-sm text-primary-foreground/60">{heroVisit.address}</p>}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {error.message}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="section-card shadow-md shadow-primary/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20"
            >
              <div className="stack-sm sm:justify-between">
                <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                <span className="rounded-full bg-primary/10 p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold text-foreground">{card.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{card.trend}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="section-card shadow-md shadow-primary/10">
          <div className="stack-sm sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Upcoming Jobs</h2>
              <p className="text-sm text-muted-foreground">Next 48 hours — synced from the field</p>
            </div>
            <Link
              href="/work"
              className="text-sm font-semibold text-primary transition hover:text-accent-foreground hover:underline"
            >
              View schedule
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {upcomingVisits.slice(0, 3).map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-border/70 bg-surface p-4 shadow-sm shadow-primary/5 transition hover:border-primary/60 hover:shadow-primary/20"
              >
                <div className="stack-sm sm:items-start sm:justify-between sm:gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{job.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      {job.address}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {job.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 font-medium">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    {formatDateTime(job.scheduledAt)}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    {job.crewName}
                  </span>
                </div>
              </div>
            ))}
            {!upcomingVisits.length && !isLoading && (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
                No visits scheduled yet. Once jobs are assigned crews, they will appear here automatically.
              </div>
            )}
          </div>
        </div>

        <div className="section-card shadow-md shadow-primary/10">
          <div className="stack-sm sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Pipeline Snapshot</h2>
              <p className="text-sm text-muted-foreground">
                Track your leads from first call to won jobs and revenue.
              </p>
            </div>
            <Link
              href="/reports/pipeline"
              className="text-sm font-semibold text-primary transition hover:text-accent-foreground hover:underline"
            >
              Pipeline report
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {pipeline.map((step) => (
              <div
                key={step.stage}
                className="stack-sm sm:flex-row sm:items-start sm:justify-between rounded-2xl bg-muted/60 p-4 transition hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{step.stage}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{step.total}</p>
                </div>
                <p className="max-w-[10rem] text-sm text-muted-foreground">{step.highlight}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Syncing live data… please wait.</div>
      )}
      {!isLoading && !metrics && (
        <div className="rounded-3xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Unable to load live metrics yet. Check your API URL or tenant header configuration.
        </div>
      )}
    </div>
  );
}
