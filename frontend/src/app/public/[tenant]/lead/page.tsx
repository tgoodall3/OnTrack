"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type PublicLeadFormState = {
  name: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  propertyLine1: string;
  propertyLine2: string;
  propertyCity: string;
  propertyState: string;
  propertyPostalCode: string;
};

const INITIAL_FORM: PublicLeadFormState = {
  name: "",
  email: "",
  phone: "",
  source: "",
  notes: "",
  propertyLine1: "",
  propertyLine2: "",
  propertyCity: "",
  propertyState: "",
  propertyPostalCode: "",
};

export default function PublicLeadFormPage() {
  const params = useParams<{ tenant: string }>();
  const tenant = params?.tenant ?? "";
  const { toast } = useToast();
  const [form, setForm] = useState<PublicLeadFormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tenant) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6 rounded-3xl border border-border bg-surface p-6 text-center shadow-md shadow-primary/10">
        <h1 className="text-2xl font-semibold text-foreground">Link unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Please verify the share link you received. The tenant slug is missing or invalid.
        </p>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitted(false);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant,
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          source: form.source.trim() || undefined,
          notes: form.notes.trim() || undefined,
          propertyLine1: form.propertyLine1.trim() || undefined,
          propertyLine2: form.propertyLine2.trim() || undefined,
          propertyCity: form.propertyCity.trim() || undefined,
          propertyState: form.propertyState.trim() || undefined,
          propertyPostalCode: form.propertyPostalCode.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Submit failed (${response.status})`);
      }

      setSubmitted(true);
      setForm(INITIAL_FORM);
      toast({
        variant: "success",
        title: "Thanks! We got it.",
        description: "A team member will follow up shortly.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit lead.";
      setError(message);
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Tell us about your project</h1>
        <p className="text-sm text-muted-foreground">
          Share a few details below and we’ll reach out from tenant <strong>{tenant}</strong>.
        </p>
      </header>

      <form className="space-y-4 text-sm text-muted-foreground" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your name</label>
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How did you hear about us?</label>
          <input
            type="text"
            value={form.source}
            onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
            placeholder="Referral, advertisement, search..."
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project location</label>
          <input
            type="text"
            value={form.propertyLine1}
            onChange={(event) => setForm((prev) => ({ ...prev, propertyLine1: event.target.value }))}
            placeholder="Street address"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="text"
            value={form.propertyLine2}
            onChange={(event) => setForm((prev) => ({ ...prev, propertyLine2: event.target.value }))}
            placeholder="Unit or suite (optional)"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <div className="grid gap-3 md:grid-cols-3">
            <input
              type="text"
              value={form.propertyCity}
              onChange={(event) => setForm((prev) => ({ ...prev, propertyCity: event.target.value }))}
              placeholder="City"
              className="rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={form.propertyState}
              onChange={(event) => setForm((prev) => ({ ...prev, propertyState: event.target.value }))}
              placeholder="State"
              className="rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={form.propertyPostalCode}
              onChange={(event) => setForm((prev) => ({ ...prev, propertyPostalCode: event.target.value }))}
              placeholder="Postal code"
              className="rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project details</label>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Tell us about the scope, timing, and any must-haves."
            rows={5}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-accent">{error}</p>}
        {submitted && !error && <p className="text-sm text-foreground">Thanks! We received your details.</p>}

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Submit
        </button>
      </form>
    </div>
  );
}
