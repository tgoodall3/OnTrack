
"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useChecklistTemplates, useCreateChecklistTemplate } from "@/hooks/use-checklist-templates";
import { useToast } from "@/components/ui/use-toast";

type NewItem = {
  id: string;
  title: string;
};

const createBlankItem = (): NewItem => ({
  id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36),
  title: "",
});

export default function ChecklistsPage() {
  const { toast } = useToast();
  const { data: templates, isLoading, error, refetch } = useChecklistTemplates();
  const createMutation = useCreateChecklistTemplate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<NewItem[]>([createBlankItem()]);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddItem = () => {
    setItems((current) => [...current, createBlankItem()]);
  };

  const handleItemChange = (id: string, value: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, title: value } : item)));
  };

  const handleRemoveItem = (id: string) => {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)));
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setItems([createBlankItem()]);
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createMutation.isPending) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Template name is required.");
      return;
    }

    const filteredItems = items
      .map((item) => item.title.trim())
      .filter((title) => title.length > 0)
      .map((title) => ({ title }));

    if (!filteredItems.length) {
      setFormError("Add at least one checklist item.");
      return;
    }

    setFormError(null);
    createMutation.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
        items: filteredItems,
      },
      {
        onSuccess: () => {
          toast({
            variant: "success",
            title: "Template created",
            description: `${trimmedName} is ready for jobs.`,
          });
          resetForm();
          void refetch();
        },
        onError: (mutationError) => {
          setFormError(mutationError.message);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Checklist Templates</h1>
          <p className="text-sm text-muted-foreground">
            Standardize recurring job steps and apply them with one click when scheduling crews.
          </p>
        </div>
      </header>

      <section className="rounded-3xl border border-border bg-surface p-6 shadow-primary/5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create template</h2>
            <p className="text-sm text-muted-foreground">
              Define the checklist items teams should complete for this workflow.
            </p>
          </div>
        </header>

        <form className="space-y-4 text-sm text-muted-foreground" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Template name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="Pre-visit inspection"
                required
              />
            </label>
            <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="Optional summary"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <header className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checklist items</span>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Add item
              </button>
            </header>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{index + 1}.</span>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(event) => handleItemChange(item.id, event.target.value)}
                    placeholder="Describe the step to complete"
                    className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="inline-flex items-center rounded-full border border-border p-2 text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-50"
                    disabled={items.length === 1}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-accent">{formError}</p>}

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save template
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-foreground">Existing templates</h2>
        </header>

        {error && (
          <div className="rounded-3xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-foreground">
            {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading templates...
          </div>
        ) : templates && templates.length > 0 ? (
          templates.map((template) => (
            <article
              key={template.id}
              className="space-y-3 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-foreground">{template.name}</p>
                  {template.description && (
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {template.items.length} item{template.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {template.items.map((item) => (
                  <li key={item.id} className="rounded-2xl bg-muted/30 px-3 py-2">
                    <span className="font-semibold text-foreground">{item.title}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No templates yet. Create your first checklist above to standardize your job workflows.
          </div>
        )}
      </section>
    </div>
  );
}
