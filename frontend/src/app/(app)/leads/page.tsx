"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, MapPin, Plus, Trash2, Users } from "lucide-react";

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

      const contactsPayload: ContactOption[] = await contactsResponse.json();
      const propertiesPayload: PropertyOption[] = await propertiesResponse.json();

      setContacts(contactsPayload);
      setProperties(propertiesPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load lookup data";
      setLookupError(message);
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
      const message = err instanceof Error ? err.message : "Unable to load leads";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function updateForm<K extends keyof CreateLeadFormState>(key: K, value: CreateLeadFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreateLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload: Record<string, unknown> = {
        stage: form.stage,
        source: emptyToUndefined(form.source),
        notes: emptyToUndefined(form.notes),
      };

      if (useExistingContact) {
        if (!selectedContactId) {
          throw new Error("Select a contact or add a new one");
        }
        payload.contactId = selectedContactId;
      } else {
        if (!form.contactName.trim()) {
          throw new Error("Contact name is required");
        }
        payload.contact = {
          name: form.contactName.trim(),
          email: emptyToUndefined(form.contactEmail),
          phone: emptyToUndefined(form.contactPhone),
        };
      }

      if (useExistingProperty) {
        if (!selectedPropertyId) {
          throw new Error("Select a property or provide an address");
        }
        payload.propertyId = selectedPropertyId;
      } else if (hasPropertyInput) {
        payload.propertyAddress = {
          line1: form.propertyLine1.trim(),
          line2: emptyToUndefined(form.propertyLine2),
          city: emptyToUndefined(form.propertyCity),
          state: emptyToUndefined(form.propertyState),
          postalCode: emptyToUndefined(form.propertyPostalCode),
        };
      }

      const response = await fetch(`${API_BASE_URL}/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Create lead failed: ${response.status}`);
      }

      setForm(INITIAL_FORM);
      setUseExistingContact(false);
      setSelectedContactId("");
      setUseExistingProperty(false);
      setSelectedPropertyId("");
      await loadLeads();
      await loadLookups();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create lead";
      setFormError(message);
    } finally {
      setSubmitting(false);
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
        throw new Error(`Update failed: ${response.status}`);
      }

      await loadLeads();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update lead";
      setError(message);
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
          "X-Tenant-ID": TENANT_HEADER,
        },
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      await loadLeads();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete lead";
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
            <p className="text-sm text-muted-foreground">
              Capture new opportunities and track progression through the pipeline.
            </p>
          </div>
          <div className="hidden items-center gap-3 text-sm text-muted-foreground sm:flex">
            <Users className="h-4 w-4 text-primary" />
            <span>{leads.length} active leads</span>
          </div>
        </div>

        <form onSubmit={handleCreateLead} className="mt-6 grid gap-4 rounded-2xl border border-dashed border-border/80 bg-muted/40 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Plus className="h-4 w-4 text-primary" />
            Add a lead
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={useExistingContact}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setUseExistingContact(checked);
                  setFormError(null);
                  if (checked) {
                    setForm((prev) => ({
                      ...prev,
                      contactName: "",
                      contactEmail: "",
                      contactPhone: "",
                    }));
                  } else {
                    setSelectedContactId("");
                  }
                }}
              />
              Use existing contact
            </label>
            {useExistingContact && (
              <select
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                value={selectedContactId}
                onChange={(event) => setSelectedContactId(event.target.value)}
              >
                <option value="">Select a contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                    {contact.email ? ` · ${contact.email}` : ""}
                  </option>
                ))}
              </select>
            )}
            {contactsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>
          {useExistingContact && selectedContactId && (
            <div className="sm:col-span-2 rounded-2xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {formatContactDetails(contacts.find((contact) => contact.id === selectedContactId))}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Contact name</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={form.contactName}
              onChange={(event) => updateForm("contactName", event.target.value)}
              placeholder="Jamie Reynolds"
              required={!useExistingContact}
              disabled={useExistingContact}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Contact email</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              type="email"
              value={form.contactEmail}
              onChange={(event) => updateForm("contactEmail", event.target.value)}
              placeholder="jamie@client.com"
              disabled={useExistingContact}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Contact phone</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={form.contactPhone}
              onChange={(event) => updateForm("contactPhone", event.target.value)}
              placeholder="(555) 123-4567"
              disabled={useExistingContact}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Stage</label>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={form.stage}
              onChange={(event) => updateForm("stage", event.target.value as LeadStage)}
            >
              {LEAD_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Source</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={form.source}
              onChange={(event) => updateForm("source", event.target.value)}
              placeholder="Web form, referral, etc."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Notes</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              rows={3}
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              placeholder="Add any intake notes or next steps."
            />
          </div>
          <div className="sm:col-span-2 grid gap-4 rounded-2xl border border-border/60 bg-background/60 p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Property (optional)</div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 font-semibold text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  checked={useExistingProperty}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setUseExistingProperty(checked);
                    setFormError(null);
                    if (!checked) {
                      setSelectedPropertyId("");
                    }
                  }}
                />
                Use existing property
              </label>
              {useExistingProperty && (
                <select
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                >
                  <option value="">Select a property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                      {property.contactName ? ` · ${property.contactName}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {(propertiesLoading || contactsLoading) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            {useExistingProperty && selectedPropertyId && (
              <div className="rounded-2xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {formatPropertyDetails(properties.find((property) => property.id === selectedPropertyId))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="Street address"
                value={form.propertyLine1}
                onChange={(event) => updateForm("propertyLine1", event.target.value)}
                disabled={useExistingProperty}
              />
              <input
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="Unit / Suite"
                value={form.propertyLine2}
                onChange={(event) => updateForm("propertyLine2", event.target.value)}
                disabled={useExistingProperty}
              />
              <input
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="City"
                value={form.propertyCity}
                onChange={(event) => updateForm("propertyCity", event.target.value)}
                disabled={useExistingProperty}
              />
              <div className="flex gap-3">
                <input
                  className="w-1/2 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="State"
                  value={form.propertyState}
                  onChange={(event) => updateForm("propertyState", event.target.value)}
                  disabled={useExistingProperty}
                />
                <input
                  className="w-1/2 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="ZIP"
                  value={form.propertyPostalCode}
                  onChange={(event) => updateForm("propertyPostalCode", event.target.value)}
                  disabled={useExistingProperty}
                />
              </div>
            </div>
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
            {formError && <p className="text-sm text-accent">{formError}</p>}
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
                  <p className="text-lg font-semibold text-foreground">{lead.contact.name}</p>
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
