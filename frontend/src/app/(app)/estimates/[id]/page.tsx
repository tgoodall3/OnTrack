"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ClipboardList, Layers, Loader2, Timer } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useEstimateTemplates, useApplyEstimateTemplate } from "@/hooks/use-estimate-templates";
import { FilesSection } from "@/components/files/files-section";

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

type EstimateApprovalEntry = {
  id: string;
  status: EstimateStatus;
  createdAt: string;
  approvedAt?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  approverName?: string | null;
  approverEmail?: string | null;
  message?: string | null;
  emailSubject?: string | null;
};

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
  template?: {
    id: string;
    name: string;
  } | null;
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

type SendEstimateInput = {
  recipientEmail: string;
  recipientName?: string;
  message?: string;
};

type ApproveEstimateInput = {
  approverName: string;
  approverEmail?: string;
  signature?: string;
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

async function updateEstimateTemplateRequest(id: string, templateId: string | null): Promise<EstimateDetail> {
  const response = await fetch(`${API_BASE_URL}/estimates/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({ templateId: templateId ?? "" }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Unable to update template (${response.status})`);
  }

  return response.json();
}

async function sendEstimateRequest(id: string, payload: SendEstimateInput): Promise<EstimateDetail> {
  const response = await fetch(`${API_BASE_URL}/estimates/${id}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Unable to send estimate (${response.status})`);
  }

  return response.json();
}

async function approveEstimateRequest(id: string, payload: ApproveEstimateInput): Promise<EstimateDetail> {
  const response = await fetch(`${API_BASE_URL}/estimates/${id}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Unable to approve estimate (${response.status})`);
  }

  return response.json();
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
  const { data: templateOptions, isLoading: templatesLoading, error: templatesError } = useEstimateTemplates();
  const availableTemplates = useMemo(
    () => (templateOptions ?? []).filter((template) => !template.isArchived),
    [templateOptions],
  );
  const applyTemplateMutation = useApplyEstimateTemplate(estimateId);

  const [jobForm, setJobForm] = useState({ start: "", end: "" });
  const [jobFormError, setJobFormError] = useState<string | null>(null);
  const [sendForm, setSendForm] = useState({ email: "", name: "", message: "" });
  const [sendFormError, setSendFormError] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState({ name: "", email: "", signature: "" });
  const [approveFormError, setApproveFormError] = useState<string | null>(null);
  const [templateSelection, setTemplateSelection] = useState("");

  const {
    data: estimate,
    isLoading,
    error,
  } = useQuery<EstimateDetail, Error>({
    queryKey: ["estimates", estimateId],
    queryFn: () => fetchEstimate(estimateId),
  });

  const selectedTemplateOption = useMemo(
    () => availableTemplates.find((template) => template.id === templateSelection),
    [availableTemplates, templateSelection],
  );
  const currentTemplateId = estimate?.template?.id ?? "";

  useEffect(() => {
    if (!estimate) {
      return;
    }
    setTemplateSelection(estimate.template?.id ?? "");
  }, [estimate?.template?.id]);

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

  const sendEstimateMutation = useMutation<EstimateDetail, Error, SendEstimateInput>({
    mutationFn: (payload) => sendEstimateRequest(estimateId, payload),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(["estimates", estimateId], updated);
      queryClient.invalidateQueries({ queryKey: ["estimates"] }).catch(() => {
        // noop
      });
      setSendFormError(null);
      setSendForm((prev) => ({ ...prev, message: "" }));
      toast({
        variant: "success",
        title: "Estimate sent",
        description: `Delivered to ${variables.recipientEmail}.`,
      });
    },
    onError: (mutationError) => {
      setSendFormError(mutationError.message);
    },
  });

  const approveEstimateMutation = useMutation<EstimateDetail, Error, ApproveEstimateInput>({
    mutationFn: (payload) => approveEstimateRequest(estimateId, payload),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(["estimates", estimateId], updated);
      queryClient.invalidateQueries({ queryKey: ["estimates"] }).catch(() => {
        // noop
      });
      setApproveFormError(null);
      toast({
        variant: "success",
        title: "Estimate approved",
        description: `Approved by ${variables.approverName}.`,
      });
      setJobForm((prev) => ({
        ...prev,
        start: prev.start || defaultJobStart(),
      }));
    },
    onError: (mutationError) => {
      setApproveFormError(mutationError.message);
    },
  });

  const updateTemplateMutation = useMutation<EstimateDetail, Error, { templateId: string | null }>({
    mutationFn: ({ templateId }) => updateEstimateTemplateRequest(estimateId, templateId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["estimates", estimateId], updated);
      queryClient.invalidateQueries({ queryKey: ["estimates"] }).catch(() => {
        // noop
      });
      setTemplateSelection(updated.template?.id ?? "");
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
      setJobForm({ start: "", end: "" });
      setJobFormError(null);
      toast({
        variant: "success",
        title: "Job scheduled",
        description: "The job is now visible on the work board.",
      });
      router.push("/work?status=SCHEDULED");
    },
    onError: (mutationError) => {
      setJobFormError(mutationError.message);
      toast({
        variant: "destructive",
        title: "Failed to create job",
        description: mutationError.message,
      });
    },
  });

  const handleApplyTemplate = () => {
    if (!templateSelection) {
      toast({
        variant: "destructive",
        title: "Select a template",
        description: "Choose a template before applying it to the estimate.",
      });
      return;
    }

    const templateName =
      availableTemplates.find((template) => template.id === templateSelection)?.name ?? "template";

    applyTemplateMutation.mutate(
      { templateId: templateSelection },
      {
        onSuccess: (result) => {
          const updated = result as EstimateDetail;
          queryClient.setQueryData(["estimates", estimateId], updated);
          toast({
            variant: "success",
            title: "Template applied",
            description: `Loaded "${templateName}" onto this estimate.`,
          });
          setTemplateSelection(updated.template?.id ?? "");
        },
        onError: (mutationError) => {
          toast({
            variant: "destructive",
            title: "Unable to apply template",
            description: mutationError.message,
          });
        },
      },
    );
  };

  const handleRemoveTemplate = () => {
    if (!estimate?.template) {
      return;
    }

    const templateName = estimate.template.name;

    updateTemplateMutation.mutate(
      { templateId: null },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(["estimates", estimateId], updated);
          toast({
            variant: "success",
            title: "Template removed",
            description: `"${templateName}" detached. Edit line items manually from here.`,
          });
          setTemplateSelection("");
        },
        onError: (mutationError) => {
          toast({
            variant: "destructive",
            title: "Unable to remove template",
            description: mutationError.message,
          });
        },
      },
    );
  };

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

  useEffect(() => {
    if (!estimate) {
      return;
    }

    if (estimate.status === "APPROVED" && !jobForm.start) {
      setJobForm((prev) => ({
        ...prev,
        start: defaultJobStart(),
      }));
    }

    if (
      estimate.latestApproval?.status === "SENT" &&
      !sendForm.email &&
      estimate.latestApproval.recipientEmail
    ) {
      setSendForm((prev) => ({
        ...prev,
        email: estimate.latestApproval?.recipientEmail ?? prev.email,
        name: estimate.latestApproval?.recipientName ?? prev.name,
      }));
    }

    if (
      estimate.latestApproval?.status === "APPROVED" &&
      !approveForm.name &&
      estimate.latestApproval.approverName
    ) {
      setApproveForm((prev) => ({
        ...prev,
        name: estimate.latestApproval?.approverName ?? prev.name,
        email: estimate.latestApproval?.approverEmail ?? prev.email,
      }));
    }
  }, [estimate, jobForm.start, sendForm.email, sendForm.name, approveForm.name, approveForm.email]);

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

  const isTemplateActionPending = applyTemplateMutation.isPending || updateTemplateMutation.isPending;
  const templateApplyDisabled =
    !templateSelection || templateSelection === currentTemplateId || isTemplateActionPending || templatesLoading;
  const templateRemoveDisabled = !estimate.template || isTemplateActionPending;
  const applyTemplateLabel = applyTemplateMutation.isPending ? "Applying..." : "Apply template";
  const removeTemplateLabel = updateTemplateMutation.isPending ? "Removing..." : "Remove template";

  const statusLabel = STATUS_OPTIONS.find((option) => option.value === estimate.status)?.label ?? estimate.status;
  const allowJobScheduling = estimate.status === "APPROVED" && !estimate.job;
  const approvalHistory = estimate.approvalHistory ?? [];
  const latestSend = estimate.latestApproval?.status === "SENT" ? estimate.latestApproval : null;
  const latestApprovalRecord = estimate.latestApproval?.status === "APPROVED" ? estimate.latestApproval : null;
  const sendButtonLabel = sendEstimateMutation.isPending
    ? "Sending..."
    : latestSend
      ? "Resend estimate"
      : "Send estimate";
  const sendDisabled = sendEstimateMutation.isPending || !sendForm.email.trim();
  const approveButtonLabel = approveEstimateMutation.isPending ? "Recording..." : "Record approval";
  const approveDisabled = approveEstimateMutation.isPending || !approveForm.name.trim();

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
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3 w-3 text-primary" aria-hidden="true" />
            {estimate.template ? estimate.template.name : "Manual entry"}
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

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Template</h3>
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {estimate.template ? estimate.template.name : "Manual entry"}
              </span>
            </div>
            {templatesError ? (
              <p className="text-xs text-accent">{templatesError.message}</p>
            ) : templatesLoading ? (
              <div className="h-10 rounded-2xl border border-dashed border-border/60 bg-muted/30 animate-pulse" />
            ) : availableTemplates.length === 0 ? (
              <p className="text-xs">No templates available yet. Create one from the templates manager.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={templateSelection}
                    onChange={(event) => setTemplateSelection(event.target.value)}
                    className="min-w-[160px] rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-60"
                    disabled={isTemplateActionPending}
                  >
                    <option value="">Manual entry</option>
                    {availableTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyTemplate}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    disabled={templateApplyDisabled}
                  >
                    {applyTemplateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    {applyTemplateLabel}
                  </button>
                  {estimate.template && (
                    <button
                      type="button"
                      onClick={handleRemoveTemplate}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-60"
                      disabled={templateRemoveDisabled}
                    >
                      {updateTemplateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                      {removeTemplateLabel}
                    </button>
                  )}
                </div>
                {selectedTemplateOption && (
                  <div className="space-y-2 rounded-2xl border border-dashed border-border/60 bg-muted/30 p-3">
                    {selectedTemplateOption.description && (
                      <p className="text-xs text-muted-foreground">{selectedTemplateOption.description}</p>
                    )}
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {selectedTemplateOption.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded border border-border/60 bg-background px-2 py-1"
                        >
                          <span className="truncate">{item.description}</span>
                          <span className="text-muted-foreground/70">
                            {item.quantity} x ${item.unitPrice.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground/60">
                      Applying a template will overwrite the current line items with the template defaults.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

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

          <FilesSection
            scope={{ estimateId: estimate.id }}
            entityLabel={`Estimate ${estimate.number}`}
            emptyState="No files yet. Upload supporting documents for this estimate."
          />
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
            <h3 className="text-sm font-semibold text-foreground">Customer delivery</h3>
            {latestSend ? (
              <p className="text-xs text-muted-foreground">
                Last sent to {latestSend.recipientEmail ?? "the customer"} on {formatDate(latestSend.createdAt)}.
              </p>
            ) : (
              <p className="text-xs">
                Email the estimate to the customer when you are ready to review or request approval.
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!sendForm.email.trim()) {
                  setSendFormError("Recipient email is required.");
                  return;
                }
                setSendFormError(null);
                sendEstimateMutation.mutate({
                  recipientEmail: sendForm.email.trim(),
                  recipientName: sendForm.name.trim() ? sendForm.name.trim() : undefined,
                  message: sendForm.message.trim() ? sendForm.message.trim() : undefined,
                });
              }}
              className="space-y-3 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-3 py-3"
            >
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide">
                Recipient email
                <input
                  type="email"
                  value={sendForm.email}
                  onChange={(event) => setSendForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                  required
                  disabled={sendEstimateMutation.isPending}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide">
                Customer name
                <input
                  type="text"
                  value={sendForm.name}
                  onChange={(event) => setSendForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                  disabled={sendEstimateMutation.isPending}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide">
                Message
                <textarea
                  value={sendForm.message}
                  onChange={(event) => setSendForm((prev) => ({ ...prev, message: event.target.value }))}
                  rows={3}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                  placeholder="Optional note to include with the proposal"
                  disabled={sendEstimateMutation.isPending}
                />
              </label>
              {sendFormError && <p className="text-xs text-accent">{sendFormError}</p>}
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                disabled={sendDisabled}
              >
                {sendEstimateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                {sendButtonLabel}
              </button>
            </form>
          </div>

          <div className="space-y-3 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Approval</h3>
            {estimate.status === "APPROVED" ? (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
                <p className="font-semibold text-foreground">
                  Approved{latestApprovalRecord?.approverName ? ` by ${latestApprovalRecord.approverName}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {latestApprovalRecord?.approvedAt
                    ? `Recorded on ${formatDate(latestApprovalRecord.approvedAt)}`
                    : `Recorded ${formatDate(latestApprovalRecord?.createdAt ?? estimate.updatedAt)}`}
                </p>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!approveForm.name.trim()) {
                    setApproveFormError("Approver name is required.");
                    return;
                  }
                  setApproveFormError(null);
                  approveEstimateMutation.mutate({
                    approverName: approveForm.name.trim(),
                    approverEmail: approveForm.email.trim() ? approveForm.email.trim() : undefined,
                    signature: approveForm.signature.trim() ? approveForm.signature.trim() : undefined,
                  });
                }}
                className="space-y-3 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-3 py-3"
              >
                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide">
                  Approver name
                  <input
                    type="text"
                    value={approveForm.name}
                    onChange={(event) => setApproveForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    required
                    disabled={approveEstimateMutation.isPending}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide">
                  Approver email
                  <input
                    type="email"
                    value={approveForm.email}
                    onChange={(event) => setApproveForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    disabled={approveEstimateMutation.isPending}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide">
                  Signature / note
                  <textarea
                    value={approveForm.signature}
                    onChange={(event) => setApproveForm((prev) => ({ ...prev, signature: event.target.value }))}
                    rows={3}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    placeholder="Optional signature information"
                    disabled={approveEstimateMutation.isPending}
                  />
                </label>
                {approveFormError && <p className="text-xs text-accent">{approveFormError}</p>}
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  disabled={approveDisabled}
                >
                  {approveEstimateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                  {approveButtonLabel}
                </button>
              </form>
            )}
          </div>

          <ApprovalHistoryCard entries={approvalHistory} />

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

function defaultJobStart(): string {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatRelativeTimeFromNow(iso: string) {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return formatDate(iso);
  }
  const now = Date.now();
  const diff = target - now;
  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(seconds) < 60) {
    return rtf.format(Math.trunc(seconds), "second");
  }
  if (Math.abs(minutes) < 60) {
    return rtf.format(Math.trunc(minutes), "minute");
  }
  if (Math.abs(hours) < 24) {
    return rtf.format(Math.trunc(hours), "hour");
  }
  if (Math.abs(days) < 7) {
    return rtf.format(Math.trunc(days), "day");
  }

  return formatDate(iso);
}

function ApprovalHistoryCard({ entries }: { entries: EstimateApprovalEntry[] }) {
  return (
    <div className="space-y-3 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5 text-sm text-muted-foreground">
      <h3 className="text-sm font-semibold text-foreground">Delivery & approvals</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">No delivery history yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
              <p className="font-semibold text-foreground">{describeApprovalEntry(entry)}</p>
              <p className="text-xs text-muted-foreground/80">
                {formatRelativeTimeFromNow(entry.createdAt)}
                {entry.emailSubject ? ` • ${entry.emailSubject}` : ""}
              </p>
              {entry.message && (
                <p className="mt-1 text-xs text-muted-foreground/70">{entry.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describeApprovalEntry(entry: EstimateApprovalEntry): string {
  switch (entry.status) {
    case "SENT": {
      const recipient =
        entry.recipientName ?? entry.recipientEmail ?? "customer";
      return `Sent to ${recipient}`;
    }
    case "APPROVED": {
      const approver =
        entry.approverName ?? entry.approverEmail ?? "customer";
      return `Approved by ${approver}`;
    }
    default:
      return `Status updated to ${entry.status.replace("_", " ").toLowerCase()}`;
  }
}
