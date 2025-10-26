"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ClipboardList, Loader2, MapPin, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type EstimateStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "ARCHIVED";

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

type CreatedJob = {
  id: string;
  status: string;
  scheduledStart?: string | null;
};

async function fetchEstimate(id: string): Promise<EstimateDetail> {
  const response = await fetch(`${API_BASE_URL}/estimates/${id}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load estimate (${response.status})`);
  }

  return response.json();
}

async function scheduleJob(payload: ScheduleJobInput): Promise<CreatedJob> {
  const response = await fetch(`${API_BASE_URL}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Job scheduling failed: ${response.status}`);
  }

  return response.json();
}

const STATUS_LABELS: Record<EstimateStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const estimateId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sharePending, setSharePending] = useState(false);

  const { data, isLoading, error } = useQuery<EstimateDetail, Error>({
    queryKey: ["estimates", estimateId],
    queryFn: () => fetchEstimate(estimateId),
    enabled: Boolean(estimateId),
  });

  const scheduleMutation = useMutation<CreatedJob, Error, ScheduleJobInput>({
    mutationFn: scheduleJob,
    onSuccess: (job) => {
      toast({
        variant: "success",
        title: "Job scheduled",
        description: "The work order is now on the crews board.",
      });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["estimates", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
      queryClient.setQueryData<EstimateDetail | undefined>(["estimates", estimateId], (current) =>
        current
          ? {
              ...current,
              job: {
                id: job.id,
                status: job.status,
                scheduledStart: job.scheduledStart ?? null,
              },
            }
          : current,
      );
    },
    onError: (mutationError) => {
      toast({
        variant: "destructive",
        title: "Unable to schedule job",
        description: mutationError.message,
      });
    },
  });

  const totals = useMemo(() => {
    if (!data) {
      return { subtotal: 0, tax: 0, total: 0 };
    }
    return {
      subtotal: data.subtotal,
      tax: data.tax,
      total: data.total,
    };
  }, [data]);

  const handleShare = async () => {
    if (!data) {
      return;
    }

    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/estimates/${estimateId}`
        : `/estimates/${estimateId}`;

    try {
      setSharePending(true);

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: data.number,
          text: `Estimate ${data.number}`,
          url,
        });
        toast({
          variant: "success",
          title: "Link shared",
          description: "The estimate link was opened in your share sheet.",
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast({
          variant: "success",
          title: "Link copied",
          description: "You can now paste the estimate link anywhere.",
        });
        return;
      }

      if (typeof window !== "undefined") {
        window.prompt("Copy this estimate link", url);
        toast({
          variant: "success",
          title: "Link ready",
          description: "Copy the highlighted URL to share the estimate.",
        });
        return;
      }

      throw new Error("Sharing is not supported in this environment.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to share estimate link.";
      toast({
        variant: "destructive",
        title: "Share failed",
        description: message,
      });
    } finally {
      setSharePending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <HeaderSkeleton />
        <div className="grid gap-5 md:grid-cols-[2fr,1fr]">
          <div className="rounded-3xl border border-border/70 bg-muted/20 p-6 shadow-sm animate-pulse" />
          <div className="rounded-3xl border border-border/70 bg-muted/20 p-6 shadow-sm animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/estimates"
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to estimates
        </Link>
        <div className="rounded-3xl border border-accent/40 bg-accent/10 p-6 text-sm text-accent-foreground">
          {error?.message ?? "Estimate not found"}
        </div>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const isApproved = data.status === "APPROVED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/estimates"
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to estimates
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            disabled={sharePending}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {sharePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share
          </button>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              isApproved ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            {statusLabel}
          </span>
        </div>
      </div>

      <section className="rounded-3xl border border-border/60 bg-surface p-6 shadow-md shadow-primary/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Estimate</p>
            <h1 className="text-3xl font-semibold text-foreground">{data.number}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Prepared for {data.lead.contactName ?? "Unnamed contact"} • {formatDate(data.createdAt)}
            </p>
            {data.expiresAt && (
              <p className="text-xs text-muted-foreground">
                Expires {formatDate(data.expiresAt)} • {formatTimeUntil(data.expiresAt)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground">Total</p>
            <p className="text-3xl font-semibold text-foreground">{formatCurrency(totals.total)}</p>
            <p className="text-xs text-muted-foreground">Subtotal {formatCurrency(totals.subtotal)} • Tax {formatCurrency(totals.tax)}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Approval Progress</p>
            <p className="text-xs">
              {data.approvals} approvals recorded • Lead stage: {data.lead.stage.replace("_", " ")}
            </p>
          </div>
          {data.job ? (
            <Link
              href={`/work?status=${data.job.status.toLowerCase()}`}
              className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <ClipboardList className="h-4 w-4" />
              View scheduled job
            </Link>
          ) : (
            <button
              type="button"
              onClick={() =>
                scheduleMutation.mutate({
                  estimateId,
                  scheduledStart: new Date().toISOString(),
                })
              }
              disabled={scheduleMutation.isPending}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {scheduleMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Convert to job
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="rounded-3xl border border-border/60 bg-surface p-6 shadow-sm shadow-primary/5">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Line items</h2>
            <span className="text-xs uppercase text-muted-foreground">{data.lineItems.length} items</span>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Description</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Unit price</th>
                  <th className="px-3 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.lineItems.map((item) => (
                  <tr key={item.id} className="border-t border-border/50">
                    <td className="px-3 py-3 align-top text-foreground">{item.description}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.quantity}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-3 py-3 text-foreground">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-border/60 bg-surface p-5 shadow-sm shadow-primary/5">
            <header className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              Engagement Overview
            </header>
            <dl className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <dt>Lead contact</dt>
                <dd className="text-foreground">{data.lead.contactName ?? "Unassigned"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Lead stage</dt>
                <dd className="capitalize text-foreground">{data.lead.stage.replace("_", " ")}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Created</dt>
                <dd>{formatDate(data.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Last updated</dt>
                <dd>{formatDate(data.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          {data.notes && (
            <div className="rounded-3xl border border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
              <header className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ClipboardList className="h-4 w-4 text-primary" />
                Internal Notes
              </header>
              <p className="whitespace-pre-wrap leading-relaxed">{data.notes}</p>
            </div>
          )}

          <div className="rounded-3xl border border-border/60 bg-muted/10 p-5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Need to revise?</p>
            <p>Editing and approval requests are coming soon. In the meantime, duplicate this estimate or contact the lead for updates.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="h-10 w-44 rounded-full bg-muted/30 animate-pulse" />
      <div className="h-8 w-64 rounded-full bg-muted/30 animate-pulse" />
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function formatTimeUntil(iso: string): string {
  const expires = new Date(iso).getTime();
  const now = Date.now();
  const diff = expires - now;
  if (diff <= 0) {
    return "Expired";
  }
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}
