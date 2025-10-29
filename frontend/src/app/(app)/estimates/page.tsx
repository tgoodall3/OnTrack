"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarClock, ClipboardCheck, Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type EstimateStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "ARCHIVED";

type EstimateApprovalEntry = {
  id: string;
  status: EstimateStatus;
  createdAt: string;
  approvedAt?: string | null;
  recipientEmail?: string | null;
  approverName?: string | null;
  emailSubject?: string | null;
  emailMessageId?: string | null;
  sentAt?: string | null;
};

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
  latestApproval: EstimateApprovalEntry | null;
  approvalHistory: EstimateApprovalEntry[];
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

async function fetchEstimates(): Promise<EstimateSummary[]> {
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

  return response.json();
}

type CreatedJob = {
  id: string;
  status: string;
  scheduledStart?: string | null;
};

async function createJob(payload: ScheduleJobInput): Promise<CreatedJob> {
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

  return response.json();
}

export default function EstimatesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight") ?? "";
  const [jobForm, setJobForm] = useState<{
    estimateId: string;
    start: string;
    end: string;
  }>({
    estimateId: "",
    start: "",
    end: "",
  });
  const [jobFormError, setJobFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery<EstimateSummary[], Error>({
    queryKey: ["estimates"],
    queryFn: fetchEstimates,
  });

  const scheduleJobMutation = useMutation<CreatedJob, Error, ScheduleJobInput, { previousEstimates?: EstimateSummary[]; optimisticId?: string }>({
    mutationFn: createJob,
    onMutate: async (input) => {
      setJobFormError(null);
      await queryClient.cancelQueries({ queryKey: ["estimates"] });
      const previousEstimates = queryClient.getQueryData<EstimateSummary[]>(["estimates"]);
      let optimisticId: string | undefined;
      if (previousEstimates) {
        optimisticId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `temp-${Math.random().toString(36).slice(2)}`;
        const optimisticJob = {
          id: optimisticId,
          status: "SCHEDULED",
          scheduledStart: input.scheduledStart ?? null,
        };
        queryClient.setQueryData<EstimateSummary[]>(["estimates"], previousEstimates.map((estimate) =>
          estimate.id === input.estimateId
            ? { ...estimate, job: optimisticJob }
            : estimate,
        ));
      }
      return { previousEstimates, optimisticId };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previousEstimates) {
        queryClient.setQueryData(["estimates"], context.previousEstimates);
      }
      setJobFormError(mutationError.message);
      toast({
        variant: "destructive",
        title: "Unable to schedule job",
        description: mutationError.message,
      });
    },
    onSuccess: (job, input, context) => {
      queryClient.setQueryData<EstimateSummary[]>(["estimates"], (current) =>
        current?.map((estimate) => {
          if (estimate.id !== input.estimateId) {
            return estimate;
          }

          const matchesOptimistic = context?.optimisticId
            ? estimate.job?.id === context.optimisticId
            : true;

          if (!matchesOptimistic) {
            return estimate;
          }

          return {
            ...estimate,
            job: {
              id: job.id,
              status: job.status,
              scheduledStart: job.scheduledStart ?? null,
            },
          };
        }),
      );
      toast({
        variant: "success",
        title: "Job scheduled",
        description: "Job has been added to the work board.",
      });
      resetJobForm();
      router.push(`/work?status=${job.status ?? "SCHEDULED"}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["estimates"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });

  const estimates = data ?? [];
  const [showScheduled, setShowScheduled] = useState(false);
  const visibleEstimates = useMemo(
    () => {
      if (showScheduled) {
        return estimates;
      }
      return estimates.filter((estimate) => !estimate.job);
    },
    [estimates, showScheduled],
  );
  const hasData = visibleEstimates.length > 0;

  function openJobForm(estimate: EstimateSummary) {
    setJobForm({
      estimateId: estimate.id,
      start: estimate.job?.scheduledStart ? toDateTimeLocal(estimate.job.scheduledStart) : defaultStart(),
      end: "",
    });
    setJobFormError(null);
  }

  function resetJobForm() {
    setJobForm({
      estimateId: "",
      start: "",
      end: "",
    });
    setJobFormError(null);
  }

  function handleScheduleJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jobForm.estimateId || !jobForm.start) {
      setJobFormError("Start time is required");
      return;
    }

    setJobFormError(null);

    scheduleJobMutation.mutate({
      estimateId: jobForm.estimateId,
      scheduledStart: new Date(jobForm.start).toISOString(),
      scheduledEnd: jobForm.end ? new Date(jobForm.end).toISOString() : undefined,
    });
  }

  const isSubmittingJob = scheduleJobMutation.isPending;
  const fetchError = error?.message ?? null;
  const showLoading = isLoading || isFetching;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Estimates</h1>
          <p className="text-sm text-muted-foreground">
            Track proposals, approvals, and conversion to jobs across your pipeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-semibold">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            {showScheduled ? estimates.length : visibleEstimates.length} estimates
          </span>
          <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border border-border text-primary focus:ring-0"
              checked={showScheduled}
              onChange={(event) => setShowScheduled(event.target.checked)}
            />
            Include scheduled jobs
          </label>
          <Link
            href="/estimates/new"
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            New estimate
          </Link>
        </div>
      </header>

      {fetchError && (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {fetchError}
        </div>
      )}

      {showLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading estimates...
        </div>
      ) : !hasData ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No estimates yet. Convert leads into proposals to see them appear here.
        </div>
      ) : (
        <section className="space-y-4">
          {visibleEstimates.map((estimate) => {
            const isHighlighted = highlightId && estimate.id === highlightId;
            return (
              <article
                key={estimate.id}
                className={`rounded-3xl border bg-surface p-6 shadow-md transition ${
                  isHighlighted ? "border-primary shadow-primary/20" : "border-border hover:border-primary/60"
                }`}
              >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    <Link href={`/estimates/${estimate.id}`} className="transition hover:text-primary">
                      {estimate.number}
                    </Link>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {estimate.lead.contactName ?? "Unnamed contact"} - {estimate.lead.stage.replace("_", " ")}
                  </p>
                  {estimate.notes && (
                    <p className="mt-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {estimate.notes}
                    </p>
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
                <StatusCard label="Subtotal" value={formatCurrency(estimate.subtotal)} />
                <StatusCard label="Tax" value={formatCurrency(estimate.tax)} />
                <StatusCard label="Approvals" value={estimate.approvals.toString()} />
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Line items</p>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                  {estimate.lineItems.map((item) => (
                    <LineItemRow key={item.id} item={item} />
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
                    Job scheduled - {estimate.job.status.replace("_", " ")}
                    {estimate.job.scheduledStart && ` - ${formatDate(estimate.job.scheduledStart)}`}
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
                          disabled={isSubmittingJob}
                        >
                          {isSubmittingJob && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                          Create job
                        </button>
                        <button
                          type="button"
                          onClick={resetJobForm}
                          className="rounded-full border border-border px-3 py-1 font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
                        >
                          Cancel
                        </button>
                        {jobFormError && <span className="text-xs text-accent">{jobFormError}</span>}
                      </form>
                     )}
                     <Link
                       href={`/estimates/${estimate.id}`}
                       className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                     >
                       View details
                     </Link>
                   </>
                 )}
              </div>
              </article>
            );
          })}
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

function LineItemRow({ item }: { item: EstimateSummary["lineItems"][number] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 last:border-none">
      <div>
        <p className="font-medium text-foreground">{item.description}</p>
        <p className="text-xs">
          Qty {item.quantity} x {formatCurrency(item.unitPrice)}
        </p>
      </div>
      <p className="text-sm font-semibold text-foreground">{formatCurrency(item.total)}</p>
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

