"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, MapPin, Timer } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type JobStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELED";

type JobSummary = {
  id: string;
  status: JobStatus;
  notes?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    stage: string;
    contactName?: string | null;
  };
  estimate?: {
    id: string;
    number?: string | null;
    status: string;
  };
  property?: {
    id: string;
    address: string;
  };
};

export default function WorkPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/jobs`, {
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        cache: "no-store",
      });

      if (!response.ok) throw new Error(`Failed to fetch jobs: ${response.status}`);

      const payload: JobSummary[] = await response.json();
      setJobs(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load jobs";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Work Orders</h1>
          <p className="text-sm text-muted-foreground">
            Monitor scheduled jobs, crews in progress, and recently completed work.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Timer className="h-4 w-4 text-primary" />
          {jobs.length} jobs
        </div>
      </header>

      {error && (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading jobs…
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No jobs yet. Once estimates are approved and scheduled, they will appear here.
        </div>
      ) : (
        <section className="space-y-4">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10 transition hover:border-primary/60"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {job.lead?.contactName ?? "Field assignment"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.estimate?.number ?? "Unscheduled estimate"} · {job.lead?.stage.replace("_", " ") ?? "Lead"}
                  </p>
                  {job.property && (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      {job.property.address}
                    </p>
                  )}
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {job.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatusCard
                  label="Scheduled"
                  value={formatDateRange(job.scheduledStart, job.scheduledEnd) ?? "Pending"}
                />
                <StatusCard label="Actual" value={formatDateRange(job.actualStart, job.actualEnd) ?? "Not started"} />
                <StatusCard label="Estimate" value={job.estimate?.status ?? "—"} />
              </div>
              {job.notes && (
                <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{job.notes}</p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">{label}</span>
      <div>{value}</div>
    </div>
  );
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return undefined;
  const startText = start ? formatDate(start) : "TBD";
  const endText = end ? formatDate(end) : "TBD";
  return `${startText} → ${endText}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(iso));
}
