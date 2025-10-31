"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ClipboardList, ExternalLink, FileDown, Layers, Loader2, Timer } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useEstimateTemplates,
  useApplyEstimateTemplate,
  useEstimateTemplate,
  type EstimateTemplateItem,
} from "@/hooks/use-estimate-templates";
import { FilesSection } from "@/components/files/files-section";
import { useEstimateFiles } from "@/hooks/use-files";

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
  emailMessageId?: string | null;
  sentAt?: string | null;
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

type CreatedJob = {
  id: string;
  status: string;
  scheduledStart?: string | null;
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
    throw new Error(`Job creation failed (${response.status})`);
  }

  return response.json();
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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
  const templateIsAvailable = currentTemplateId
    ? availableTemplates.some((template) => template.id === currentTemplateId)
    : false;
  const {
    data: attachedTemplateDetail,
    isLoading: attachedTemplateLoading,
  } = useEstimateTemplate(
    currentTemplateId && !templateIsAvailable ? currentTemplateId : null,
    Boolean(currentTemplateId && !templateIsAvailable),
  );
  const appliedTemplateOption = useMemo(
    () => (currentTemplateId ? availableTemplates.find((template) => template.id === currentTemplateId) ?? null : null),
    [availableTemplates, currentTemplateId],
  );
  const appliedTemplateDetail = appliedTemplateOption ?? attachedTemplateDetail ?? null;
  const templateIsArchived = Boolean(
    currentTemplateId && appliedTemplateDetail && appliedTemplateDetail.isArchived,
  );
  const templateHasAdjustments = useMemo(() => {
    if (!estimate || !estimate.template?.id || !appliedTemplateDetail) {
      return false;
    }
    return !lineItemsMatchTemplate(estimate.lineItems, appliedTemplateDetail.items);
  }, [estimate, appliedTemplateDetail]);
  const reapplyDisabled =
    !estimate?.template || applyTemplateMutation.isPending || attachedTemplateLoading;

  useEffect(() => {
    if (!estimate) {
      return;
    }
    const appliedId = estimate.template?.id ?? "";
    if (appliedId && !availableTemplates.some((template) => template.id === appliedId)) {
      setTemplateSelection("");
      return;
    }
    setTemplateSelection(appliedId);
  }, [estimate?.template?.id, availableTemplates]);

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
      queryClient.invalidateQueries({ queryKey: ["estimates", estimateId, "files"] }).catch(() => {
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

  const { data: estimateFiles, isLoading: estimateFilesLoading } = useEstimateFiles(estimateId);
  const latestPdfAttachment = useMemo(() => {
    if (!estimateFiles || estimateFiles.length === 0) {
      return null;
    }
    return (
      [...estimateFiles]
        .filter(
          (file) =>
            file.type === "DOCUMENT" &&
            (file.mimeType?.toLowerCase().includes("pdf") || file.fileName.toLowerCase().endsWith(".pdf")),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
    );
  }, [estimateFiles]);

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

  const scheduleJobMutation = useMutation<CreatedJob, Error, ScheduleJobInput>({
    mutationFn: scheduleJob,
    onSuccess: (job) => {
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
      router.push(`/work?status=${job.status ?? "SCHEDULED"}`);
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

  const handleApplyTemplate = (options?: { templateId?: string; allowReapply?: boolean }) => {
    const targetTemplateId = options?.templateId ?? templateSelection;

    if (!targetTemplateId) {
      toast({
        variant: "destructive",
        title: "Select a template",
        description: "Choose a template before applying it to the estimate.",
      });
      return;
    }

    if (!options?.allowReapply && targetTemplateId === currentTemplateId) {
      toast({
        variant: "destructive",
        title: "Template already applied",
        description: "Pick a different template or make manual edits to customize the estimate.",
      });
      return;
    }

    const selected =
      templateOptions?.find((template) => template.id === targetTemplateId) ?? undefined;
    const templateName = selected?.name ?? "template";

    setTemplateSelection(targetTemplateId);

    applyTemplateMutation.mutate(
      { templateId: targetTemplateId },
      {
        onSuccess: (result) => {
          const updated = result as EstimateDetail;
          queryClient.setQueryData(["estimates", estimateId], updated);
          toast({
            variant: "success",
            title: "Template applied",
            description: options?.allowReapply
              ? `Reset to "${templateName}" defaults.`
              : `Loaded "${templateName}" onto this estimate.`,
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

  const handleDownloadPdf = async () => {
    if (!estimate) {
      return;
    }

    try {
      setDownloadingPdf(true);
      const response = await fetch(`${API_BASE_URL}/estimates/${estimateId}/export/pdf`, {
        headers: {
          "X-Tenant-ID": TENANT_HEADER,
        },
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Failed to download PDF (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeName = (estimate.number || `estimate-${estimateId}`).replace(/[^\w.-]+/g, "_");
      anchor.href = url;
      anchor.download = `${safeName}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast({
        variant: "success",
        title: "PDF downloaded",
        description: "Check your downloads for the exported estimate.",
      });
    } catch (downloadError) {
      toast({
        variant: "destructive",
        title: "Unable to download PDF",
        description:
          downloadError instanceof Error ? downloadError.message : "Unknown error occurred.",
      });
    } finally {
      setDownloadingPdf(false);
    }
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
        message: estimate.latestApproval?.message ?? prev.message,
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
  const latestSendTimestamp = latestSend?.sentAt ?? latestSend?.createdAt ?? null;
  const latestSendRecipient = latestSend
    ? latestSend.recipientName ?? latestSend.recipientEmail ?? "customer"
    : null;
  const sendButtonLabel = sendEstimateMutation.isPending
    ? "Sending..."
    : latestSend
      ? "Resend estimate"
      : "Send estimate";
  const sendDisabled = sendEstimateMutation.isPending || !sendForm.email.trim();
  const approveButtonLabel = approveEstimateMutation.isPending ? "Recording..." : "Record approval";
  const approveDisabled = approveEstimateMutation.isPending || !approveForm.name.trim();

  return (
    <div className="page-stack">
      <header className="section-card shadow-md shadow-primary/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Link
              href="/estimates"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-primary"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              Back to estimates
            </Link>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Estimate {estimate.number}</h1>
              <p className="text-sm text-muted-foreground">
                Created {formatDate(estimate.createdAt)} &bull; Last updated {formatDate(estimate.updatedAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={downloadingPdf}
            >
              {downloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden="true" />
              )}
              {downloadingPdf ? "Preparing PDF..." : "Download PDF"}
            </button>
            {latestPdfAttachment && (
              <a
                href={latestPdfAttachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-muted/30 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary sm:w-auto"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View last upload
              </a>
            )}
          </div>
        </div>

        <div className="chip-group">
          <span className="chip chip--primary">
            <ClipboardList className="h-3 w-3 text-primary" aria-hidden="true" />
            {statusLabel}
          </span>
          <span className="chip chip--outline">
            <Layers className="h-3 w-3 text-primary" aria-hidden="true" />
            {estimate.template ? estimate.template.name : "Manual entry"}
          </span>
          <label className="chip chip--outline gap-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide">Status</span>
            <select
              value={estimate.status}
              onChange={(event) => updateStatusMutation.mutate(event.target.value as EstimateStatus)}
              className="bg-transparent text-sm font-semibold tracking-wide text-muted-foreground focus:outline-none"
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

      <section className="page-stack lg:grid lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)] lg:gap-6">
        <div className="section-card shadow-sm shadow-primary/5">
          <header className="stack-sm sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Proposal summary</h2>
              <p className="text-sm text-muted-foreground">Line items and totals that will be shared with the customer.</p>
            </div>
            <Link
              href={`/leads/${estimate.lead.id}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary sm:w-auto"
            >
              View lead
            </Link>
          </header>

          <div className="section-card section-card--muted text-sm text-muted-foreground">
            <div className="stack-sm sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
              <h3 className="text-sm font-semibold text-foreground">Template</h3>
              <span className="chip chip--outline text-[0.65rem]">
                {estimate.template ? estimate.template.name : "Manual entry"}
              </span>
            </div>
            {templatesError ? (
              <p className="text-xs text-accent">{templatesError.message}</p>
            ) : templatesLoading ? (
              <div className="h-10 rounded-2xl border border-dashed border-border/60 bg-muted/30 animate-pulse" />
            ) : availableTemplates.length === 0 ? (
              <p className="text-xs">
                No active templates available. Create a new template in the manager or keep editing this estimate manually.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <select
                    value={templateSelection}
                    onChange={(event) => setTemplateSelection(event.target.value)}
                    className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-60 sm:w-auto"
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
                    onClick={() => handleApplyTemplate()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
                    disabled={templateApplyDisabled}
                  >
                    {applyTemplateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {applyTemplateLabel}
                  </button>
                  {estimate.template && (
                    <button
                      type="button"
                      onClick={handleRemoveTemplate}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-60 sm:w-auto"
                      disabled={templateRemoveDisabled}
                    >
                      {updateTemplateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {removeTemplateLabel}
                    </button>
                  )}
                </div>
                {selectedTemplateOption && (
                  <div className="space-y-3 rounded-2xl border border-dashed border-border/60 bg-background/70 p-4 text-sm">
                    {selectedTemplateOption.description && (
                      <p className="text-sm text-muted-foreground/80">{selectedTemplateOption.description}</p>
                    )}
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {selectedTemplateOption.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2"
                        >
                          <span className="truncate">{item.description}</span>
                          <span className="text-muted-foreground/70">
                            {item.quantity} x ${item.unitPrice.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[0.75rem] text-muted-foreground/60">
                      Applying a template overwrites the current line items with the template defaults.
                    </p>
                  </div>
                )}
              </>
            )}
            {estimate.template && attachedTemplateLoading && !appliedTemplateDetail && (
              <p className="mt-2 text-xs text-muted-foreground/80">Loading template details…</p>
            )}
            {estimate.template && templateIsArchived && (
              <div className="mt-3 rounded-2xl border border-dashed border-border/60 bg-amber-100/40 px-3 py-2 text-xs text-amber-900">
                This template is archived. You can keep the current line items or choose a new template to replace it.
              </div>
            )}
            {estimate.template && templateHasAdjustments && appliedTemplateDetail && !templateIsArchived && (
              <div className="mt-3 space-y-2 rounded-2xl border border-accent/40 bg-accent/10 px-3 py-3 text-xs text-accent-foreground">
                <p>
                  Line items were edited after applying <span className="font-semibold">{appliedTemplateDetail.name}</span>.
                  Reapply to reset quantities and pricing.
                </p>
                <button
                  type="button"
                  onClick={() => handleApplyTemplate({ templateId: appliedTemplateDetail.id, allowReapply: true })}
                  className="inline-flex items-center gap-2 rounded-full border border-accent px-3 py-1 text-[0.75rem] font-semibold uppercase tracking-wide transition hover:bg-accent/10 disabled:opacity-60"
                  disabled={reapplyDisabled}
                >
                  {applyTemplateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                  Reapply template defaults
                </button>
              </div>
            )}
          </div>

          <div className="section-card shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            {estimate.lineItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-2xl bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-foreground">{item.description}</p>
                  <p className="text-sm text-muted-foreground/80">
                    Qty {item.quantity} &bull; {formatCurrency(item.unitPrice)}
                  </p>
                </div>
                <p className="text-base font-semibold text-foreground sm:text-lg">{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>

          <div className="section-card section-card--muted text-sm text-muted-foreground">
            <div className="stack-sm sm:items-center sm:justify-between">
              <span className="font-semibold text-foreground">Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="stack-sm sm:items-center sm:justify-between">
              <span className="font-semibold text-foreground">Tax (8.25%)</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="stack-sm sm:items-center sm:justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="section-card section-card--muted text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Notes</h3>
            <p className="mt-1 leading-relaxed">
              {estimate.notes?.length ? estimate.notes : "No notes captured."}
            </p>
          </div>

          <FilesSection
            scope={{ estimateId: estimate.id }}
            entityLabel={`Estimate ${estimate.number}`}
            emptyState="No files yet. Upload supporting documents for this estimate."
          />
        </div>

        <aside className="space-y-4">
          <div className="section-card shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Lead snapshot</h3>
            <div className="space-y-2">
              <SnapshotRow icon={<ClipboardList className="h-4 w-4 text-primary" />} label="Lead stage" value={estimate.lead.stage.replace("_", " ")} />
              <SnapshotRow icon={<Timer className="h-4 w-4 text-primary" />} label="Created" value={formatDate(estimate.createdAt)} />
              <SnapshotRow icon={<CalendarClock className="h-4 w-4 text-primary" />} label="Expires" value={estimate.expiresAt ? formatDate(estimate.expiresAt) : "Not set"} />
            </div>
          </div>

          <div className="section-card shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Customer delivery</h3>
            {latestSend ? (
              <div className="space-y-1 rounded-2xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">
                  Delivered{" "}
                  {latestSendTimestamp ? formatRelativeTimeFromNow(latestSendTimestamp) : formatDate(latestSend.createdAt)}
                </p>
                <p className="text-muted-foreground/80">
                  Sent to {latestSendRecipient ?? "the customer"}.
                </p>
                {latestSend.emailSubject && (
                  <p className="text-muted-foreground/70">Subject: {latestSend.emailSubject}</p>
                )}
                {latestSend.message && (
                  <p className="text-muted-foreground/70">Message: {latestSend.message}</p>
                )}
                {latestSend.emailMessageId && (
                  <p className="font-mono text-[11px] text-muted-foreground/70">
                    Message ID: {latestSend.emailMessageId}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm">
                Email the estimate to the customer when you are ready to review or request approval.
              </p>
            )}
            {estimateFilesLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading attachments...</p>
            ) : latestPdfAttachment ? (
              <div className="mt-3 space-y-2 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">Latest PDF</span>
                  <span>{formatRelativeTimeFromNow(latestPdfAttachment.createdAt)}</span>
                </div>
                <a
                  href={latestPdfAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={latestPdfAttachment.fileName}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary sm:w-auto"
                >
                  Download {latestPdfAttachment.fileName}
                </a>
              </div>
            ) : null}
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
              className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-4"
            >
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recipient email
                <input
                  type="email"
                  value={sendForm.email}
                  onChange={(event) => setSendForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  required
                  disabled={sendEstimateMutation.isPending}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Customer name
                <input
                  type="text"
                  value={sendForm.name}
                  onChange={(event) => setSendForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  disabled={sendEstimateMutation.isPending}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Message
                <textarea
                  value={sendForm.message}
                  onChange={(event) => setSendForm((prev) => ({ ...prev, message: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Optional note to include with the proposal"
                  disabled={sendEstimateMutation.isPending}
                />
              </label>
              {sendFormError && <p className="text-sm text-accent">{sendFormError}</p>}
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                disabled={sendDisabled}
              >
                {sendEstimateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {sendButtonLabel}
              </button>
            </form>
          </div>

          <div className="section-card shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Approval</h3>
            {estimate.status === "APPROVED" ? (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="font-semibold text-foreground">
                  Approved{latestApprovalRecord?.approverName ? ` by ${latestApprovalRecord.approverName}` : ""}
                </p>
                <p className="text-sm text-muted-foreground/80">
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
                className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-4"
              >
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Approver name
                  <input
                    type="text"
                    value={approveForm.name}
                    onChange={(event) => setApproveForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    required
                    disabled={approveEstimateMutation.isPending}
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Approver email
                  <input
                    type="email"
                    value={approveForm.email}
                    onChange={(event) => setApproveForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    disabled={approveEstimateMutation.isPending}
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Signature / note
                  <textarea
                    value={approveForm.signature}
                    onChange={(event) => setApproveForm((prev) => ({ ...prev, signature: event.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Optional signature information"
                    disabled={approveEstimateMutation.isPending}
                  />
                </label>
                {approveFormError && <p className="text-sm text-accent">{approveFormError}</p>}
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  disabled={approveDisabled}
                >
                  {approveEstimateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {approveButtonLabel}
                </button>
              </form>
            )}
          </div>

          <ApprovalHistoryCard entries={approvalHistory} />

          <div className="section-card shadow-sm shadow-primary/5 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Job conversion</h3>
            {estimate.job ? (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
                <p className="font-semibold text-foreground">Job scheduled</p>
                <p className="text-sm text-muted-foreground/80">
                  Status: {estimate.job.status.replace("_", " ").toLowerCase()}
                  {estimate.job.scheduledStart ? ` - ${formatDate(estimate.job.scheduledStart)}` : ""}
                </p>
                <Link
                  href="/work"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
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
                  className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-4"
                >
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Start
                    <input
                      type="datetime-local"
                      value={jobForm.start}
                      onChange={(event) => setJobForm((prev) => ({ ...prev, start: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    End
                    <input
                      type="datetime-local"
                      value={jobForm.end}
                      onChange={(event) => setJobForm((prev) => ({ ...prev, end: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  {jobFormError && <p className="text-sm text-accent">{jobFormError}</p>}
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    disabled={!allowJobScheduling || scheduleJobMutation.isPending}
                  >
                    {scheduleJobMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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

function lineItemsMatchTemplate(
  lineItems: EstimateDetail["lineItems"],
  templateItems: EstimateTemplateItem[],
): boolean {
  if (templateItems.length === 0) {
    return lineItems.length === 0;
  }

  if (lineItems.length !== templateItems.length) {
    return false;
  }

  for (let index = 0; index < templateItems.length; index += 1) {
    const estimateItem = lineItems[index];
    const templateItem = templateItems[index];

    if (!estimateItem) {
      return false;
    }

    if (estimateItem.description.trim() !== templateItem.description.trim()) {
      return false;
    }

    if (Number(estimateItem.quantity) !== Number(templateItem.quantity)) {
      return false;
    }

    if (Number(estimateItem.unitPrice) !== Number(templateItem.unitPrice)) {
      return false;
    }
  }

  return true;
}

function SnapshotRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <span className="text-base text-foreground sm:text-sm">{value}</span>
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
    <div className="section-card shadow-sm shadow-primary/5 text-sm text-muted-foreground">
      <h3 className="text-sm font-semibold text-foreground">Delivery & approvals</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">No delivery history yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <p className="font-semibold text-foreground">{describeApprovalEntry(entry)}</p>
              <p className="text-sm text-muted-foreground/80">
                {formatRelativeTimeFromNow(entry.sentAt ?? entry.createdAt)}
              </p>
              {entry.emailSubject && (
                <p className="text-sm text-muted-foreground/70">Subject: {entry.emailSubject}</p>
              )}
              {entry.emailMessageId && (
                <p className="font-mono text-[11px] text-muted-foreground/60">Message ID: {entry.emailMessageId}</p>
              )}
              {entry.message && (
                <p className="mt-1 text-sm text-muted-foreground/70">{entry.message}</p>
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
