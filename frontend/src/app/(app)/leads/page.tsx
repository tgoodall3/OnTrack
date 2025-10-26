"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, MapPin, Trash2, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type LeadSummary = {
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

type LeadStage = "NEW" | "QUALIFIED" | "SCHEDULED_VISIT" | "WON" | "LOST";

const LEAD_STAGES: LeadStage[] = ["NEW", "QUALIFIED", "SCHEDULED_VISIT", "WON", "LOST"];

type ContactOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  leads: number;
};

type PropertyOption = {
  id: string;
  address: string;
  contactName?: string;
};

type CreateLeadFormState = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  stage: LeadStage;
  source: string;
  notes: string;
  propertyLine1: string;
  propertyLine2: string;
  propertyCity: string;
  propertyState: string;
  propertyPostalCode: string;
};

const INITIAL_FORM: CreateLeadFormState = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  stage: "NEW",
  source: "",
  notes: "",
  propertyLine1: "",
  propertyLine2: "",
  propertyCity: "",
  propertyState: "",
  propertyPostalCode: "",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateLeadFormState>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [useExistingContact, setUseExistingContact] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [useExistingProperty, setUseExistingProperty] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const { toast } = useToast();

  const hasPropertyInput = useMemo(() => {
    if (useExistingProperty) return false;
    return Boolean(
      form.propertyLine1 ||
        form.propertyLine2 ||
        form.propertyCity ||
        form.propertyState ||
        form.propertyPostalCode,
    );
  }, [form, useExistingProperty]);

  useEffect(() => {
    void loadLeads();
    void loadLookups();
  }, []);

  async function loadLookups() {
    setContactsLoading(true);
    setPropertiesLoading(true);
    setLookupError(null);

    try {
      const [contactsResponse, propertiesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/contacts?take=50`, {
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_HEADER,
          },
          cache: "no-store",
        }),
        fetch(`${API_BASE_URL}/properties?take=50`, {
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_HEADER,
          },
          cache: "no-store",
        }),
      ]);

      if (!contactsResponse.ok) {
        throw new Error(`Contacts fetch failed: ${contactsResponse.status}`);
      }
      if (!propertiesResponse.ok) {
        throw new Error(`Properties fetch failed: ${propertiesResponse.status}`);
      }

      const [contactsPayload, propertiesPayload] = await Promise.all([
        contactsResponse.json(),
        propertiesResponse.json(),
      ]);

      setContacts(contactsPayload);
      setProperties(propertiesPayload);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Failed to load lookups.");
    } finally {
      setContactsLoading(false);
      setPropertiesLoading(false);
    }
  }

  async function loadLeads() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/leads`, {
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch leads: ${response.status}`);
      }

      const payload: LeadSummary[] = await response.json();
      setLeads(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStageChange(id: string, stage: LeadStage) {
    setUpdatingId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/leads/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify({ stage }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update lead: ${response.status}`);
      }

      const updated = await response.json();
      setLeads((prev) => prev.map((lead) => (lead.id === id ? updated : lead)));
      toast({
        variant: "success",
        title: "Stage updated",
        description: `Lead moved to ${stage.replace("_", " ").toLowerCase()}.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lead stage.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(id: string) {
    setUpdatingId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/leads/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete lead: ${response.status}`);
      }

      setLeads((prev) => prev.filter((lead) => lead.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete lead.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload: Record<string, unknown> = {
      stage: form.stage,
      source: emptyToUndefined(form.source),
      notes: emptyToUndefined(form.notes),
    };

    if (useExistingContact) {
      if (!selectedContactId) {
        setFormError("Select an existing contact or enter contact details.");
        return;
      }
      payload.contactId = selectedContactId;
    } else {
      if (!form.contactName.trim()) {
        setFormError("Contact name is required.");
        return;
      }
      payload.contact = {
        name: form.contactName.trim(),
        email: emptyToUndefined(form.contactEmail),
        phone: emptyToUndefined(form.contactPhone),
      };
    }

    if (useExistingProperty) {
      if (!selectedPropertyId) {
        setFormError("Select an existing property or provide property details.");
        return;
      }
      payload.propertyId = selectedPropertyId;
    } else if (hasPropertyInput) {
      payload.propertyAddress = {
        line1: emptyToUndefined(form.propertyLine1),
        line2: emptyToUndefined(form.propertyLine2),
        city: emptyToUndefined(form.propertyCity),
        state: emptyToUndefined(form.propertyState),
        postalCode: emptyToUndefined(form.propertyPostalCode),
      };
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to create lead: ${response.status}`);
      }

      const created = await response.json();
      setLeads((prev) => [created, ...prev]);
      setForm(INITIAL_FORM);
      setSelectedContactId("");
      setSelectedPropertyId("");
      setUseExistingContact(false);
      setUseExistingProperty(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create lead.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Manage inbound opportunities, track their stage, and convert high potential deals into estimates.
          </p>
        </div>
        <div className="inline-flex items-center gap-3 rounded-full border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 text-primary" />
          {leads.length} active
        </div>
      </header>

      <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/10">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add lead</h2>
            <p className="text-sm text-muted-foreground">Capture new opportunities or link existing contacts/properties.</p>
          </div>
        </header>

        <form className="space-y-4 text-sm text-muted-foreground" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</legend>

              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <input
                  type="checkbox"
                  checked={useExistingContact}
                  onChange={(event) => setUseExistingContact(event.target.checked)}
                />
                Use existing contact
              </label>

              {useExistingContact ? (
                <select
                  value={selectedContactId}
                  onChange={(event) => setSelectedContactId(event.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  disabled={contactsLoading}
                >
                  <option value="">Select contact…</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {formatContactDetails(contact)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))}
                    placeholder="Contact name"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    required
                  />
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                    placeholder="Email"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(event) => setForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                    placeholder="Phone"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              )}
            </fieldset>

            <fieldset className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Property</legend>

              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <input
                  type="checkbox"
                  checked={useExistingProperty}
                  onChange={(event) => setUseExistingProperty(event.target.checked)}
                />
                Use existing property
              </label>

              {useExistingProperty ? (
                <select
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  disabled={propertiesLoading}
                >
                  <option value="">Select property…</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {formatPropertyDetails(property)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={form.propertyLine1}
                    onChange={(event) => setForm((prev) => ({ ...prev, propertyLine1: event.target.value }))}
                    placeholder="Address line 1"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <input
                    type="text"
                    value={form.propertyLine2}
                    onChange={(event) => setForm((prev) => ({ ...prev, propertyLine2: event.target.value }))}
                    placeholder="Address line 2"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={form.propertyCity}
                      onChange={(event) => setForm((prev) => ({ ...prev, propertyCity: event.target.value }))}
                      placeholder="City"
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <input
                      type="text"
                      value={form.propertyState}
                      onChange={(event) => setForm((prev) => ({ ...prev, propertyState: event.target.value }))}
                      placeholder="State"
                      className="w-full rounded border border-border	bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={form.propertyPostalCode}
                    onChange={(event) => setForm((prev) => ({ ...prev, propertyPostalCode: event.target.value }))}
                    placeholder="Postal code"
                    className="w-full rounded border	border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              )}
            </fieldset>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</label>
              <select
                value={form.stage}
                onChange={(event) => setForm((prev) => ({ ...prev, stage: event.target.value as LeadStage }))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {LEAD_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</label>
              <input
                type="text"
                value={form.source}
                onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                placeholder="Referral, ad campaign, etc."
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Background details, next steps, client preferences..."
              className="min-h-[120px] w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {formError && <p className="text-sm text-accent">{formError}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Create lead
            </button>
          </div>
        </form>
      </section>

      {error && (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {error}
        </div>
      )}
      {lookupError && (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {lookupError}
        </div>
      )}

      <section className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading leads…
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No leads yet. Add your first opportunity above to start building the pipeline.
          </div>
        ) : (
          leads.map((lead) => (
            <article
              key={lead.id}
              className="rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10 transition hover:border-primary/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    <Link href={`/leads/${lead.id}`} className="transition hover:text-primary">
                      {lead.contact.name}
                    </Link>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {lead.contact.email && <span>{lead.contact.email}</span>}
                    {lead.contact.phone && <span>• {lead.contact.phone}</span>}
                    <span>• Added {formatDate(lead.createdAt)}</span>
                  </div>
                  {lead.property && (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      {lead.property.address}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={lead.stage}
                    onChange={(event) => void handleStageChange(lead.id, event.target.value as LeadStage)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none"
                    disabled={updatingId === lead.id}
                  >
                    {LEAD_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleDelete(lead.id)}
                    className="rounded-full border border-border/80 p-2 text-muted-foreground transition hover:border-accent hover:text-accent"
                    disabled={updatingId === lead.id}
                    aria-label="Delete lead"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {lead.source && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 font-medium">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    {lead.source}
                  </span>
                )}
                <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 font-medium">
                  Estimates {lead.metrics.estimates}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 font-medium">
                  Jobs {lead.metrics.jobs}
                </span>
                <Link
                  href={`/leads/${lead.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  View details
                </Link>
              </div>
              {lead.notes && (
                <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{lead.notes}</p>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function formatContactDetails(contact?: ContactOption) {
  if (!contact) {
    return "Contact not found";
  }
  const parts = [contact.name];
  if (contact.email) parts.push(contact.email);
  if (contact.phone) parts.push(contact.phone);
  parts.push(`${contact.leads} leads`);
  return parts.filter(Boolean).join(" · ");
}

function formatPropertyDetails(property?: PropertyOption) {
  if (!property) return "Property not found";
  return [property.address, property.contactName].filter(Boolean).join(" · ");
}
