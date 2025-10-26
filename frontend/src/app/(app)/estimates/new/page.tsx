"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useEstimateTemplates } from "@/hooks/use-estimate-templates";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type LeadSummary = {
  id: string;
  stage: string;
  contact: {
    name: string;
    email?: string | null;
  };
};

type EstimateStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "ARCHIVED";

const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

type LineItemDraft = {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type EstimateInput = {
  leadId: string;
  status: EstimateStatus;
  notes?: string | null;
  expiresAt?: string | null;
  templateId?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};

async function fetchLeads(): Promise<LeadSummary[]> {
  const response = await fetch(`${API_BASE_URL}/leads`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load leads (${response.status})`);
  }

  return response.json();
}

type CreatedEstimate = {
  id: string;
  lead: {
    id: string;
  };
};

async function createEstimate(payload: EstimateInput): Promise<CreatedEstimate> {
  const response = await fetch(`${API_BASE_URL}/estimates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Estimate creation failed (${response.status})`);
  }

  return response.json();
}

const createBlankLineItem = (): LineItemDraft => ({
  key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36),
  description: "",
  quantity: 1,
  unitPrice: 0,
});

export default function NewEstimatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const prefilledLeadId = searchParams.get("leadId") ?? "";

  const { data: leads, isLoading: leadsLoading, error: leadsError } = useQuery<LeadSummary[], Error>({
    queryKey: ["leads", "estimate-create"],
    queryFn: fetchLeads,
  });
  const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useEstimateTemplates();
  const templates = templatesData ?? [];
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [leadId, setLeadId] = useState(prefilledLeadId);
  const [status, setStatus] = useState<EstimateStatus>("DRAFT");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([createBlankLineItem()]);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (prefilledLeadId) {
      setLeadId(prefilledLeadId);
    }
  }, [prefilledLeadId]);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setLineItems(
      selectedTemplate.items.map((item) => {
        const blank = createBlankLineItem();
        return {
          ...blank,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        };
      }),
    );
    setFormError(null);
  }, [selectedTemplate]);

  const availableLeads = leads ?? [];
  const hasLeadSelected = leadId.trim().length > 0;

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = subtotal * 0.0825;
    const total = subtotal + tax;
    return {
      subtotal,
      tax,
      total,
    };
  }, [lineItems]);

  const mutation = useMutation<CreatedEstimate, Error, EstimateInput>({
    mutationFn: createEstimate,
    onSuccess: (estimate) => {
      toast({
        variant: "success",
        title: "Estimate created",
        description: "Redirecting to the estimate details so you can review, send, or schedule it.",
      });
      router.push(`/estimates/${estimate.id}`);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Could not create estimate",
        description: error.message,
      });
    },
  });

  const handleAddLineItem = () => {
    setLineItems((current) => [...current, createBlankLineItem()]);
  };

  const handleRemoveLineItem = (key: string) => {
    setLineItems((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)));
  };

  const handleLineItemChange = (key: string, field: keyof LineItemDraft, value: string) => {
    setLineItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        if (field === "quantity" || field === "unitPrice") {
          const numeric = Number(value);
          return {
            ...item,
            [field]: Number.isFinite(numeric) ? numeric : 0,
          };
        }
        return { ...item, [field]: value };
      }),
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;

    if (!hasLeadSelected) {
      setFormError("Select a lead before saving.");
      return;
    }

    const normalizedLineItems = lineItems
      .map((item) => ({
        description: item.description.trim(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }))
      .filter((item) => item.description.length > 0 && item.quantity > 0);

    if (!normalizedLineItems.length) {
      setFormError("Add at least one line item with a description and quantity.");
      return;
    }

    setFormError(null);
    mutation.mutate({
      leadId,
      status,
      templateId: selectedTemplate ? selectedTemplate.id : undefined,
      notes: notes.trim().length ? notes.trim() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      lineItems: normalizedLineItems,
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div className="space-y-1">
          <Link
            href="/estimates"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Back to estimates
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Create Estimate</h1>
          <p className="text-sm text-muted-foreground">
            Assemble a proposal, review the totals, and send it to the customer once ready.
          </p>
        </div>
        <div className="rounded-full bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Phase 2 &bull; Estimates
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5">
        <section className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lead
            <select
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
              disabled={leadsLoading}
              required
            >
              <option value="">Select lead...</option>
              {availableLeads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.contact.name} &mdash; {lead.stage.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
            {leadsError && (
              <span className="text-xs text-accent">{leadsError.message}</span>
            )}
          </label>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as EstimateStatus)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {Object.entries(ESTIMATE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Expiration date
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Optional terms or internal reminders"
            />
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide">
            Template
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
              disabled={templatesLoading}
            >
              <option value="">Manual entry</option>
              {templates
                .filter((template) => !template.isArchived)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
            </select>
          </label>
          {templatesError && (
            <p className="text-xs text-accent">{templatesError.message}</p>
          )}
          {selectedTemplate && (
            <div className="space-y-2 rounded-2xl border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              {selectedTemplate.description && <p>{selectedTemplate.description}</p>}
              <ul className="space-y-1">
                {selectedTemplate.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded border border-border/60 bg-background px-2 py-1">
                    <span className="truncate text-muted-foreground">{item.description}</span>
                    <span className="text-muted-foreground/80">
                      {item.quantity} × ${item.unitPrice.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground/60">
                Adjust any line items below after loading the template.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
          <header className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Line items</span>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add item
            </button>
          </header>

          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div
                key={item.key}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background px-3 py-2"
              >
                <span className="text-xs font-semibold text-muted-foreground">{index + 1}.</span>
                <input
                  type="text"
                  value={item.description}
                  onChange={(event) => handleLineItemChange(item.key, "description", event.target.value)}
                  placeholder="Describe the work or material"
                  className="flex-1 min-w-[160px] rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  required
                />
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Qty
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantity}
                    onChange={(event) => handleLineItemChange(item.key, "quantity", event.target.value)}
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unit
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(event) => handleLineItemChange(item.key, "unitPrice", event.target.value)}
                    className="w-24 rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveLineItem(item.key)}
                  className="inline-flex items-center rounded-full border border-border p-2 text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-40"
                  disabled={lineItems.length === 1}
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid gap-2 rounded-2xl bg-background/70 p-3 text-sm text-muted-foreground">
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
        </section>

        {formError && <p className="text-sm text-accent">{formError}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save estimate
          </button>
          <Link
            href="/estimates"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}
