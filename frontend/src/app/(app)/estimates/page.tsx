"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ClipboardCheck, Loader2 } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type EstimateStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "ARCHIVED";

type EstimateSummary = {
  id: string;
  number: string;
  status: EstimateStatus;
  subtotal: number;
  tax: number;
  total: number;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    stage: string;
    contactName?: string | null;
  };
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  approvals: number;
  job?: {
    id: string;
    status: string;
    scheduledStart?: string | null;
  };
};

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState<{
    estimateId: string;
    start: string;
    end: string;
    submitting: boolean;
    error: string | null;
  }>({
    estimateId: "",
    start: "",
    end: "",
    submitting: false,
    error: null,
  });

  useEffect(() => {
    void loadEstimates();
  }, []);

  async function loadEstimates() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/estimates`, {
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load estimates: ${response.status}`);
      }

      const payload: EstimateSummary[] = await response.json();
      setEstimates(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load estimates";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function openJobForm(estimate: EstimateSummary) {
    setJobForm({
      estimateId: estimate.id,
      start: estimate.job?.scheduledStart ? toDateTimeLocal(estimate.job.scheduledStart) : defaultStart(),
      end: "",
      submitting: false,
      error: null,
    });
  }

  function resetJobForm() {
    setJobForm({
      estimateId: "",
      start: "",
      end: "",
      submitting: false,
      error: null,
    });
  }

  async function handleScheduleJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jobForm.estimateId) return;

    setJobForm((prev) => ({ ...prev, submitting: true, error: null }));

    try {
      const payload: Record<string, unknown> = {
        estimateId: jobForm.estimateId,
      };

      if (jobForm.start) {
        payload.scheduledStart = new Date(jobForm.start).toISOString();
      }
      if (jobForm.end) {
        payload.scheduledEnd = new Date(jobForm.end).toISOString();
      }

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Job creation failed: ${response.status}`);
      }

      resetJobForm();
      await loadEstimates();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to schedule job";
      setJobForm((prev) => ({ ...prev, error: message }));
    } finally {
      setJobForm((prev) => ({ ...prev, submitting: false }));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Estimates</h1>
          <p className="text-sm text-muted-foreground">
            Track proposals, approvals, and conversion to jobs across your pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          {estimates.length} estimates
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
          Loading estimates…
        </div>
      ) : estimates.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No estimates yet. Convert leads into proposals to see them appear here.
        </div>
      ) : (
        <section className="space-y-4">
          {estimates.map((estimate) => (
            <article
              key={estimate.id}
              className="rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10 transition hover:border-primary/60"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">{estimate.number}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {estimate.lead.contactName ?? "Unnamed contact"} · {estimate.lead.stage.replace("_", " ")}
                  </p>
                  {estimate.notes && (
                    <p className="mt-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{estimate.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {estimate.status.replace("_", " ")}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    Total {formatCurrency(estimate.total)}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Subtotal</span>
                  <div>{formatCurrency(estimate.subtotal)}</div>
                </div>
                <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Tax</span>
                  <div>{formatCurrency(estimate.tax)}</div>
                </div>
                <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Approvals</span>
                  <div>{estimate.approvals}</div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Line items</p>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              {estimate.lineItems.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 last:border-none">
                      <div>
                        <p className="font-medium text-foreground">{item.description}</p>
                        <p className="text-xs">
                          Qty {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(item.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
              {estimate.expiresAt && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Expires {formatDate(estimate.expiresAt)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {estimate.job ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-semibold text-foreground">
                    Job scheduled · {estimate.job.status.replace("_", " ")}
                    {estimate.job.scheduledStart && ` · ${formatDate(estimate.job.scheduledStart)}`}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openJobForm(estimate)}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                    >
                      Schedule job
                    </button>
                    {jobForm.estimateId === estimate.id && (
                      <form
                        onSubmit={handleScheduleJob}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 px-3 py-2 text-xs"
                      >
                        <label className="flex items-center gap-2">
                          Start
                          <input
                            type="datetime-local"
                            value={jobForm.start}
                            onChange={(event) =>
                              setJobForm((prev) => ({ ...prev, start: event.target.value }))
                            }
                            className="rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                            required
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          End
                          <input
                            type="datetime-local"
                            value={jobForm.end}
                            onChange={(event) =>
                              setJobForm((prev) => ({ ...prev, end: event.target.value }))
                            }
                            className="rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                          />
                        </label>
                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                          disabled={jobForm.submitting}
                        >
                          {jobForm.submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                          Create job
                        </button>
                        <button
                          type="button"
                          onClick={resetJobForm}
                          className="rounded-full border border-border px-3 py-1 font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
                        >
                          Cancel
                        </button>
                        {jobForm.error && (
                          <span className="text-xs text-accent">{jobForm.error}</span>
                        )}
                      </form>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(iso?: string | null) {
  if (!iso) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function defaultStart() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return toDateTimeLocal(date.toISOString());
}

function toDateTimeLocal(iso: string) {
  return iso.slice(0, 16);
}
