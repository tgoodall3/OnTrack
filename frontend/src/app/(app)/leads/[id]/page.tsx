"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ClipboardList, Loader2, MapPin, Plus, Share2, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type LeadStage = "NEW" | "QUALIFIED" | "SCHEDULED_VISIT" | "WON" | "LOST";

type LeadDetail = {
  id: string;
  stage: LeadStage;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  property?: {
    id: string;
    address: string;
  };
  metrics: {
    estimates: number;
    jobs: number;
  };
};

type LeadActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  actor?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  meta?: Record<string, unknown> | null;
};

const ACTIVITY_LABELS: Record<string, string> = {
  'lead.created': 'Lead created',
  'lead.stage_updated': 'Stage updated',
  'lead.notes_updated': 'Notes updated',
  'lead.estimate_created': 'Estimate created',
  'lead.estimate_status_updated': 'Estimate status updated',
  'lead.estimate_updated': 'Estimate updated',
  'lead.estimate_sent': 'Estimate sent',
  'lead.estimate_approved': 'Estimate approved',
  'lead.job_created': 'Job created',
  'lead.deleted': 'Lead deleted',
};

const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  SCHEDULED_VISIT: "Scheduled visit",
  WON: "Won",
  LOST: "Lost",
};

const LEAD_STAGE_OPTIONS: Array<{ value: LeadStage; label: string }> = Object.entries(LEAD_STAGE_LABELS).map(
  ([value, label]) => ({
    value: value as LeadStage,
    label,
  }),
);

async function fetchLead(id: string): Promise<LeadDetail> {
  const response = await fetch(`${API_BASE_URL}/leads/${id}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load lead (${response.status})`);
  }

  return response.json();
}

async function patchLead(id: string, payload: Partial<{ stage: LeadStage; notes: string | null }>): Promise<LeadDetail> {
  const response = await fetch(`${API_BASE_URL}/leads/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update lead: ${response.status}`);
  }

  return response.json();
}

async function fetchLeadActivity(id: string): Promise<LeadActivityEntry[]> {
  const response = await fetch(`${API_BASE_URL}/leads/${id}/activity`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load lead history (${response.status})`);
  }

  return response.json();
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sharePending, setSharePending] = useState(false);

  const {
    data,
    isLoading,
    error,
  } = useQuery<LeadDetail, Error>({
    queryKey: ["leads", leadId],
    queryFn: () => fetchLead(leadId),
    enabled: Boolean(leadId),
  });

  const {
    data: activityData,
    isLoading: activityLoading,
    error: activityError,
  } = useQuery<LeadActivityEntry[], Error>({
    queryKey: ["leads", leadId, "activity"],
    queryFn: () => fetchLeadActivity(leadId),
    enabled: Boolean(leadId),
  });

  const [notesDraft, setNotesDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => {
    if (data) {
      setNotesDraft(data.notes ?? "");
    }
  }, [data]);

  const stageMutation = useMutation<LeadDetail, Error, { id: string; stage: LeadStage }, { previous?: LeadDetail }>({
    mutationFn: ({ id, stage }) => patchLead(id, { stage }),
    onMutate: async (input) => {
      const previous = queryClient.getQueryData<LeadDetail>(["leads", leadId]);
      await queryClient.cancelQueries({ queryKey: ["leads", leadId] });
      queryClient.setQueryData<LeadDetail | undefined>(["leads", leadId], (current) =>
        current ? { ...current, stage: input.stage } : current,
      );
      queryClient.setQueryData<LeadDetail[] | undefined>(["leads"], (current) =>
        current?.map((lead) => (lead.id === leadId ? { ...lead, stage: input.stage } : lead)),
      );
      return { previous };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["leads", leadId], context.previous);
      }
      toast({
        variant: "destructive",
        title: "Stage update failed",
        description: mutationError.message,
      });
    },
    onSuccess: (lead) => {
      queryClient.setQueryData(["leads", leadId], lead);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["leads", leadId, "activity"] });
      toast({
        variant: "success",
        title: "Lead updated",
        description: `Stage set to ${LEAD_STAGE_LABELS[lead.stage]}.`,
      });
    },
  });

  const metadata = useMemo(() => {
    if (!data) {
      return null;
    }
    return [
      {
        label: "Created",
        value: formatDate(data.createdAt),
      },
      {
        label: "Last updated",
        value: formatDate(data.updatedAt),
      },
      {
        label: "Source",
        value: data.source ?? "Not specified",
      },
    ];
  }, [data]);

  const notesMutation = useMutation<
    LeadDetail,
    Error,
    { id: string; notes: string | null },
    { previous?: LeadDetail; previousList?: LeadDetail[] }
  >({
    mutationFn: ({ id, notes }) => patchLead(id, { notes }),
    onMutate: async (input) => {
      const previous = queryClient.getQueryData<LeadDetail>(["leads", leadId]);
      const previousList = queryClient.getQueryData<LeadDetail[]>(["leads"]);
      await queryClient.cancelQueries({ queryKey: ["leads", leadId] });
      await queryClient.cancelQueries({ queryKey: ["leads"] });

      queryClient.setQueryData<LeadDetail | undefined>(["leads", leadId], (current) =>
        current ? { ...current, notes: input.notes ?? null } : current,
      );
      queryClient.setQueryData<LeadDetail[] | undefined>(["leads"], (current) =>
        current?.map((lead) => (lead.id === leadId ? { ...lead, notes: input.notes ?? null } : lead)),
      );

      return { previous, previousList };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["leads", leadId], context.previous);
      }
      if (context?.previousList) {
        queryClient.setQueryData(["leads"], context.previousList);
      }
      toast({
        variant: "destructive",
        title: "Notes update failed",
        description: mutationError.message,
      });
    },
    onSuccess: (lead) => {
      queryClient.setQueryData(["leads", leadId], lead);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads", leadId, "activity"] });
      toast({
        variant: "success",
        title: "Notes saved",
      });
      setEditingNotes(false);
    },
  });

  const handleSaveNotes = () => {
    notesMutation.mutate({
      id: leadId,
      notes: notesDraft.trim().length ? notesDraft : null,
    });
  };

  const handleCancelNotes = () => {
    setNotesDraft(data?.notes ?? "");
    setEditingNotes(false);
  };

  const handleShare = async () => {
    if (!data) return;

    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/leads/${leadId}`
        : `/leads/${leadId}`;

    try {
      setSharePending(true);

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: data.contact.name,
          text: `Lead: ${data.contact.name}`,
          url,
        });
        toast({
          variant: "success",
          title: "Link shared",
          description: "Opened your share sheet for this lead.",
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast({
          variant: "success",
          title: "Link copied",
          description: "Paste the lead link to hand off details.",
        });
        return;
      }

      if (typeof window !== "undefined") {
        window.prompt("Copy this lead link", url);
        toast({
          variant: "success",
          title: "Link ready",
          description: "Copy the highlighted URL to share the lead.",
        });
        return;
      }

      throw new Error("Sharing is not supported in this environment.");
    } catch (err) {
      const description = err instanceof Error ? err.message : "Unable to share lead link.";
      toast({
        variant: "destructive",
        title: "Share failed",
        description,
      });
    } finally {
      setSharePending(false);
    }
  };

  if (isLoading) {
    return <LeadSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/leads"
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Link>
        <div className="rounded-3xl border border-accent/40 bg-accent/15 p-6 text-sm text-accent-foreground">
          {error?.message ?? "Lead not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/leads"
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to leads
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
          <ContactActions contact={data.contact} />
          <StageSelect
            value={data.stage}
            isUpdating={stageMutation.isPending}
            onChange={(stage) => stageMutation.mutate({ id: leadId, stage })}
          />
        </div>
      </div>

      <section className="rounded-3xl border border-border/60 bg-surface p-6 shadow-md shadow-primary/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Lead</p>
            <h1 className="text-3xl font-semibold text-foreground">{data.contact.name}</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {data.contact.email && <p>{data.contact.email}</p>}
              {data.contact.phone && <p>{data.contact.phone}</p>}
            </div>
          </div>
          <div className="text-right text-xs uppercase text-muted-foreground">
            <p>Stage</p>
            <p className="text-lg font-semibold text-foreground">{LEAD_STAGE_LABELS[data.stage]}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Estimates" icon={<ClipboardList className="h-4 w-4 text-primary" />} value={data.metrics.estimates} />
          <MetricCard label="Jobs" icon={<Users className="h-4 w-4 text-primary" />} value={data.metrics.jobs} />
          <MetricCard label="Source" icon={<CalendarClock className="h-4 w-4 text-primary" />} value={data.source ?? "Unknown"} />
        </div>

        {data.property && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            {data.property.address}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SummaryCard
            label="Estimates created"
            value={data.metrics.estimates}
            ctaLabel="New estimate"
            onClick={() => router.push(`/estimates/new?leadId=${leadId}`)}
          />
          <SummaryCard
            label="Jobs scheduled"
            value={data.metrics.jobs}
            ctaLabel="View work board"
            href={`/work?status=all`}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[3fr,2fr]">
        <section className="rounded-3xl border border-border/60 bg-surface p-6 shadow-sm shadow-primary/5">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Engagement summary</h2>
            <button
              type="button"
              onClick={() => router.push(`/estimates/new?leadId=${leadId}`)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              Create estimate
            </button>
          </header>

          <dl className="space-y-3 text-sm text-muted-foreground">
            {metadata?.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-muted/20 px-3 py-2">
                <dt className="font-semibold text-foreground">{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-border/60 bg-surface p-5 shadow-sm shadow-primary/5">
            <header className="mb-3 text-sm font-semibold text-foreground">Recent activity</header>
            <ActivityList
              entries={activityData}
              isLoading={activityLoading}
              error={activityError}
            />
          </div>

          <div className="rounded-3xl border border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
            <header className="mb-3 flex items-center justify-between text-sm font-semibold text-foreground">
              <span>Notes</span>
              {editingNotes ? null : (
                <button
                  type="button"
                  onClick={() => setEditingNotes(true)}
                  className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Edit
                </button>
              )}
            </header>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  className="min-h-[140px] w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Discovery details, preferences, next steps..."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={notesMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {notesMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save notes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelNotes}
                    disabled={notesMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : data.notes ? (
              <p className="whitespace-pre-wrap leading-relaxed">{data.notes}</p>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-xs text-muted-foreground">
                No notes yet. Click edit to capture discovery details and next steps.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StageSelect({
  value,
  isUpdating,
  onChange,
}: {
  value: LeadStage;
  isUpdating: boolean;
  onChange: (stage: LeadStage) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>Stage</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as LeadStage)}
          className="appearance-none rounded-full border border-border bg-background px-3 py-1.5 pr-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none"
          disabled={isUpdating}
        >
          {LEAD_STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isUpdating && <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-primary" />}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <span>{icon}</span>
      <div>
        <p className="text-xs uppercase tracking-wide">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function LeadSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-32 rounded-full bg-muted/30 animate-pulse" />
        <div className="h-8 w-48 rounded-full bg-muted/30 animate-pulse" />
      </div>
      <div className="grid gap-5 md:grid-cols-[2fr,1fr]">
        <div className="h-56 rounded-3xl border border-border/70 bg-muted/20 shadow-sm animate-pulse" />
        <div className="h-56 rounded-3xl border border-border/70 bg-muted/20 shadow-sm animate-pulse" />
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function SummaryCard({
  label,
  value,
  ctaLabel,
  href,
  onClick,
}: {
  label: string;
  value: number;
  ctaLabel: string;
  href?: string;
  onClick?: () => void;
}) {
  const actionClasses =
    "mt-3 inline-flex items-center text-xs font-semibold text-primary underline-offset-4 hover:underline";

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <div>
        <p className="text-xs uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
      {href ? (
        <Link href={href} className={actionClasses}>
          {ctaLabel}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={actionClasses}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

function ActivityList({
  entries,
  isLoading,
  error,
}: {
  entries: LeadActivityEntry[] | undefined;
  isLoading: boolean;
  error: Error | null | undefined;
}) {
  const labelForAction = (action: string) =>
    ACTIVITY_LABELS[action] ?? action;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-10 rounded-2xl bg-muted/20 animate-pulse" />
        <div className="h-10 rounded-2xl bg-muted/20 animate-pulse" />
        <div className="h-10 rounded-2xl bg-muted/20 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
        {error.message}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-xs text-muted-foreground">
        No activity yet. Stage changes and note edits will appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-3 text-sm text-muted-foreground">
      {entries.map((activity) => {
        const metaDescription = describeMeta(activity.meta);
        return (
        <li
          key={activity.id}
          className="rounded-2xl border border-border/60 bg-muted/10 px-3 py-2"
        >
          <p className="font-semibold text-foreground">{labelForAction(activity.action)}</p>
          <p className="text-xs">
            {activity.actor?.name ?? activity.actor?.email ?? "System"} · {formatRelative(activity.createdAt)}
          </p>
          {metaDescription && (
            <p className="text-xs text-muted-foreground/80">
              {metaDescription}
            </p>
          )}
        </li>
        );
      })}
    </ul>
  );
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / (1000 * 60));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function describeMeta(meta?: Record<string, unknown> | null): string | undefined {
  if (!meta) {
    return undefined;
  }

  const record = meta as Record<string, unknown>;

  if ('estimateId' in record && record.estimateId) {
    const status =
      typeof record.status === "string" ? record.status.toLowerCase() : undefined;
    return status
      ? `Estimate ${String(record.estimateId)} (${status})`
      : `Estimate ${String(record.estimateId)}`;
  }

  if ('jobId' in record && record.jobId) {
    const status =
      typeof record.status === "string" ? record.status.toLowerCase() : undefined;
    return status
      ? `Job ${String(record.jobId)} (${status})`
      : `Job ${String(record.jobId)}`;
  }

  if ('from' in record && 'to' in record) {
    return `Changed from ${String(record.from)} to ${String(
      record.to,
    )}`;
  }

  return undefined;
}

function ContactActions({ contact }: { contact: LeadDetail["contact"] }) {
  const mailto = contact.email ? `mailto:${contact.email}` : undefined;
  const tel = contact.phone ? `tel:${contact.phone}` : undefined;

  if (!mailto && !tel) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2">
      {mailto && (
        <a
          href={mailto}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          Email
        </a>
      )}
      {tel && (
        <a
          href={tel}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          Call
        </a>
      )}
    </div>
  );
}
