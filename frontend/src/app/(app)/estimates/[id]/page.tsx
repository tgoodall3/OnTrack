"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ClipboardList, Loader2, Timer } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type EstimateStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "ARCHIVED";

const STATUS_OPTIONS: Array<{ value: EstimateStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ARCHIVED", label: "Archived" },
];

type EstimateDetail = {
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

type ScheduleJobInput = {
  estimateId: string;
  scheduledStart?: string;
  scheduledEnd?: string;
};

async function fetchEstimate(id: string): Promise<EstimateDetail> {
  const response = await fetch(`${API_BASE_URL}/estimates/${id}`, {
    headers: {
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(`Failed to load estimate (${response.status})`);
  }

  return response.json();
}

async function patchEstimateStatus(id: string, status: EstimateStatus) {
  const response = await fetch(`${API_BASE_URL}/estimates/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error(`Unable to update estimate (${response.status})`);
  }

  return response.json() as Promise<EstimateDetail>;
}

async function scheduleJob(payload: ScheduleJobInput) {
  const response = await fetch(`${API_BASE_URL}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Job creation failed (${response.status})`);
  }

  return response.json() as Promise<{ id: string }>;
}

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const estimateId = params.id;
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [jobForm, setJobForm] = useState({ start: "", end: "" });
  const [jobFormError, setJobFormError] = useState<string | null>(null);

  const {
    data: estimate,
    isLoading,
    error,
  } = useQuery<EstimateDetail, Error>({
    queryKey: ["estimates", estimateId],
    queryFn: () => fetchEstimate(estimateId),
  });

  const updateStatusMutation = useMutation<EstimateDetail, Error, EstimateStatus>({
    mutationFn: (status) => patchEstimateStatus(estimateId, status),
    onSuccess: (updated) => {
      queryClient.setQueryData(["estimates", estimateId], updated);
      queryClient.invalidateQueries({ queryKey: ["estimates"] }).catch(() => {
        // noop
      });
      toast({
        variant: "success",
        title: "Estimate updated",
        description: `Status set to ${STATUS_OPTIONS.find((option) => option.value === updated.status)?.label ?? updated.status}.`,
      });
    },
    onError: (mutationError) => {
      toast({
        variant: "destructive",
        title: "Unable to update estimate",
        description: mutationError.message,
      });
    },
  });

  const scheduleJobMutation = useMutation<{ id: string }, Error, ScheduleJobInput>({
    mutationFn: scheduleJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates", estimateId] }).catch(() => {
        // noop
      });
      queryClient.invalidateQueries({ queryKey: ["estimates"] }).catch(() => {
        // noop
      });
      toast({
        variant: "success",
        title: "Job scheduled",
        description: "The job is now visible on the work board.",
      });
      router.push("/work?status=SCHEDULED");
    },
    onError: (mutationError) => {
      toast({
        variant: "destructive",
        title: "Failed to create job",
        description: mutationError.message,
      });
    },
  });

  const totals = useMemo(() => {
    if (!estimate) {
      return {
        subtotal: 0,
        tax: 0,
        total: 0,
      };
    }

    return {
      subtotal: estimate.subtotal,
      tax: estimate.tax,
      total: estimate.total,
    };
  }, [estimate]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-3xl border border-border/60 bg-muted/20 animate-pulse" />
        <div className="h-48 rounded-3xl border border-border/60 bg-muted/20 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
        {error.message}
      </div>
    );
  }

  if (!estimate) {
    notFound();
  }

  const statusLabel = STATUS_OPTIONS.find((option) => option.value === estimate.status)?.label ?? estimate.status;
  const allowJobScheduling = estimate.status === "APPROVED" && !estimate.job;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <Link
            href="/estimates"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Back to estimates
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Estimate {estimate.number}</h1>
          <p className="text-sm text-muted-foreground">
            Created {formatDate(estimate.createdAt)} &bull; Last updated {formatDate(estimate.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ClipboardList className="h-3 w-3 text-primary" aria-hidden="true" />
            {statusLabel}
          </span>
          <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus-within:border-primary">
            <span>Status</span>
            <select
              value={estimate.status}
              onChange={(event) => updateStatusMutation.mutate(event.target.value as EstimateStatus)}
              className="bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:outline-none"
              disabled={updateStatusMutation.isPending}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {updateStatusMutation.isPending && <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />}
          </label>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-[2fr,1fr]">
        <div className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Proposal summary</h2>
              <p className="text-sm text-muted-foreground">Line items and totals that will be shared with the customer.</p>
            </div>
            <Link
              href={`/leads/${estimate.lead.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              View lead
            </Link>
          </header>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            {estimate.lineItems.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-background px-3 py-2">
                <div>
                  <p className="font-semibold text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground/80">
                    Qty {item.quantity} &bull; {formatCurrency(item.unitPrice)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Tax (8.25%)</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Notes</h3>
            <p className="mt-1">{estimate.notes?.length ? estimate.notes : "No notes captured."}</p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="space-y-3 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Lead snapshot</h3>
            <div className="space-y-2">
              <SnapshotRow icon={<ClipboardList className="h-4 w-4 text-primary" />} label="Lead stage" value={estimate.lead.stage.replace("_", " ")} />
              <SnapshotRow icon={<Timer className="h-4 w-4 text-primary" />} label="Created" value={formatDate(estimate.createdAt)} />
              <SnapshotRow icon={<CalendarClock className="h-4 w-4 text-primary" />} label="Expires" value={estimate.expiresAt ? formatDate(estimate.expiresAt) : "Not set"} />
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Job conversion</h3>
            {estimate.job ? (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
                <p className="font-semibold text-foreground">Job scheduled</p>
                <p className="text-xs">
                  Status: {estimate.job.status.replace("_", " ").toLowerCase()}
                  {estimate.job.scheduledStart ? ` • ${formatDate(estimate.job.scheduledStart)}` : ""}
                </p>
                <Link
                  href="/work"
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  Go to work board
                </Link>
              </div>
            ) : (
              <>
                <p>
                  Once the estimate is approved, schedule the crew and automatically create the work order.
                </p>
                <button
                  type="button"
                  onClick={() => updateStatusMutation.mutate("APPROVED")}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
                  disabled={estimate.status === "APPROVED" || updateStatusMutation.isPending}
                >
                  Mark as approved
                </button>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!allowJobScheduling) {
                      setJobFormError("Approve the estimate before scheduling a job.");
                      return;
                    }
                    if (!jobForm.start) {
                      setJobFormError("Enter the scheduled start time.");
                      return;
                    }
                    setJobFormError(null);
                    scheduleJobMutation.mutate({
                      estimateId: estimate.id,
                      scheduledStart: new Date(jobForm.start).toISOString(),
                      scheduledEnd: jobForm.end ? new Date(jobForm.end).toISOString() : undefined,
                    });
                  }}
                  className="space-y-3 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-3 py-3"
                >
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide">Start</span>
                    <input
                      type="datetime-local"
                      value={jobForm.start}
                      onChange={(event) => setJobForm((prev) => ({ ...prev, start: event.target.value }))}
                      className="w-48 rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide">End</span>
                    <input
                      type="datetime-local"
                      value={jobForm.end}
                      onChange={(event) => setJobForm((prev) => ({ ...prev, end: event.target.value }))}
                      className="w-48 rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    />
                  </label>
                  {jobFormError && <p className="text-xs text-accent">{jobFormError}</p>}
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    disabled={!allowJobScheduling || scheduleJobMutation.isPending}
                  >
                    {scheduleJobMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    Schedule job
                  </button>
                </form>
              </>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function SnapshotRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/20 px-3 py-2">
      <div className="inline-flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(iso));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
