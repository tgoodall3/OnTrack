"use client";

import Link from "next/link";
import { Dispatch, SetStateAction, useMemo, useState, type JSX } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  EstimateTemplateSummary,
  useArchiveEstimateTemplate,
  useCreateEstimateTemplate,
  useEstimateTemplates,
  useRestoreEstimateTemplate,
  useUpdateEstimateTemplate,
} from "@/hooks/use-estimate-templates";
import { useToast } from "@/components/ui/use-toast";

type TemplateDraftItem = {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type TemplateDraft = {
  name: string;
  description: string;
  items: TemplateDraftItem[];
};

function createEmptyItem(): TemplateDraftItem {
  return { description: "", quantity: "1", unitPrice: "0" };
}

function normalizeNumber(input: string): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function sanitizeDraft(
  draft: TemplateDraft,
): { name: string; description?: string | null; items: TemplateDraftItem[] } {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const items = draft.items
    .map((item) => ({
      id: item.id,
      description: item.description.trim(),
      quantity: item.quantity.trim(),
      unitPrice: item.unitPrice.trim(),
    }))
    .filter((item) => item.description.length > 0);

  return {
    name,
    description: description.length ? description : undefined,
    items,
  };
}

function toMutationPayload(
  draft: TemplateDraft,
): {
  name: string;
  description?: string | null;
  items: Array<{ id?: string; description: string; quantity: number; unitPrice: number }>;
} {
  const sanitized = sanitizeDraft(draft);
  return {
    name: sanitized.name,
    description: sanitized.description,
    items: sanitized.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: normalizeNumber(item.quantity),
      unitPrice: normalizeNumber(item.unitPrice),
    })),
  };
}

function validateDraft(draft: TemplateDraft): string | null {
  const { name, items } = sanitizeDraft(draft);
  if (!name) {
    return "Template name is required.";
  }
  if (items.length === 0) {
    return "Add at least one line item.";
  }
  const invalidItem = items.find(
    (item) =>
      normalizeNumber(item.quantity) <= 0 || normalizeNumber(item.unitPrice) < 0,
  );
  if (invalidItem) {
    return "Line item quantities must be greater than 0 and prices cannot be negative.";
  }
  return null;
}

export default function EstimateTemplatesPage(): JSX.Element {
  const { data, isLoading, error } = useEstimateTemplates(true);
  const templates = data ?? [];
  const activeTemplates = useMemo(
    () => templates.filter((template) => !template.isArchived),
    [templates],
  );
  const archivedTemplates = useMemo(
    () => templates.filter((template) => template.isArchived),
    [templates],
  );

  const { toast } = useToast();
  const createTemplate = useCreateEstimateTemplate();
  const archiveTemplate = useArchiveEstimateTemplate();
  const restoreTemplate = useRestoreEstimateTemplate();

  const [createDraft, setCreateDraft] = useState<TemplateDraft>({
    name: "",
    description: "",
    items: [createEmptyItem()],
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TemplateDraft | null>(null);

  const updateTemplate = useUpdateEstimateTemplate(editingTemplateId ?? "");

  const resetCreateDraft = () =>
    setCreateDraft({
      name: "",
      description: "",
      items: [createEmptyItem()],
    });

  const startEdit = (template: EstimateTemplateSummary) => {
    setEditingTemplateId(template.id);
    setEditDraft({
      name: template.name,
      description: template.description ?? "",
      items: template.items
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          id: item.id,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
        })),
    });
  };

  const cancelEdit = () => {
    setEditingTemplateId(null);
    setEditDraft(null);
  };

  const handleCreate = async () => {
    const validationError = validateDraft(createDraft);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Cannot create template",
        description: validationError,
      });
      return;
    }

    try {
      await createTemplate.mutateAsync(toMutationPayload(createDraft));
      toast({
        variant: "success",
        title: "Template created",
        description: `${createDraft.name} is now available when building estimates.`,
      });
      resetCreateDraft();
    } catch (mutationError) {
      toast({
        variant: "destructive",
        title: "Failed to create template",
        description:
          mutationError instanceof Error ? mutationError.message : "Unknown error occurred.",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplateId || !editDraft) {
      return;
    }

    const validationError = validateDraft(editDraft);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Cannot update template",
        description: validationError,
      });
      return;
    }

    try {
      await updateTemplate.mutateAsync(toMutationPayload(editDraft));
      toast({
        variant: "success",
        title: "Template updated",
        description: `${editDraft.name} is ready for the next estimate.`,
      });
      cancelEdit();
    } catch (mutationError) {
      toast({
        variant: "destructive",
        title: "Failed to update template",
        description:
          mutationError instanceof Error ? mutationError.message : "Unknown error occurred.",
      });
    }
  };

const moveItem = (
  draftSetter: Dispatch<SetStateAction<TemplateDraft>>,
    index: number,
    direction: -1 | 1,
  ) => {
    draftSetter((prev) => {
      const nextItems = [...prev.items];
      const target = index + direction;
      if (target < 0 || target >= nextItems.length) {
        return prev;
      }
      [nextItems[index], nextItems[target]] = [nextItems[target], nextItems[index]];
      return { ...prev, items: nextItems };
    });
  };

const removeItem = (
  draftSetter: Dispatch<SetStateAction<TemplateDraft>>,
    index: number,
  ) => {
    draftSetter((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index);
      return { ...prev, items: nextItems.length ? nextItems : [createEmptyItem()] };
    });
  };

const addItem = (
  draftSetter: Dispatch<SetStateAction<TemplateDraft>>,
  ) => {
    draftSetter((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem()],
    }));
  };

  const archive = async (templateId: string) => {
    try {
      await archiveTemplate.mutateAsync({ templateId });
      toast({
        variant: "success",
        title: "Template archived",
        description: "The template is hidden from new estimates but preserved for history.",
      });
    } catch (mutationError) {
      toast({
        variant: "destructive",
        title: "Failed to archive template",
        description:
          mutationError instanceof Error ? mutationError.message : "Unknown error occurred.",
      });
    }
  };

  const restore = async (templateId: string) => {
    try {
      await restoreTemplate.mutateAsync({ templateId });
      toast({
        variant: "success",
        title: "Template restored",
        description: "The template is available for new estimates again.",
      });
    } catch (mutationError) {
      toast({
        variant: "destructive",
        title: "Failed to restore template",
        description:
          mutationError instanceof Error ? mutationError.message : "Unknown error occurred.",
      });
    }
  };

  return (
    <div className="page-stack">
      <header className="section-card stack-sm sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 shadow-md shadow-primary/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estimates
          </p>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Estimate templates</h1>
          <p className="text-sm text-muted-foreground">
            Build reusable estimate structures with standard line items and pricing.
          </p>
        </div>
        <Link
          href="/estimates"
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          Back to estimates
        </Link>
      </header>

      <section className="section-card shadow-sm shadow-primary/5">
        <div className="stack-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create template</h2>
            <p className="text-sm text-muted-foreground">
              Save a template to prefill line items on future estimates.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="create-name">
              Name
            </label>
            <input
              id="create-name"
              type="text"
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Standard interior painting"
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="create-description"
            >
              Description
            </label>
            <input
              id="create-description"
              type="text"
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Notes for the crew or customer"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Line items</h3>
            <button
              type="button"
              onClick={() => addItem(setCreateDraft)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-3 w-3" aria-hidden="true" /> Add item
            </button>
          </div>

          <div className="space-y-3">
            {createDraft.items.map((item, index) => (
              <LineItemEditor
                key={`create-${index}`}
                index={index}
                item={item}
                totalItems={createDraft.items.length}
                onChange={(next) =>
                  setCreateDraft((prev) => {
                    const items = [...prev.items];
                    items[index] = next;
                    return { ...prev, items };
                  })
                }
                onMove={(direction) => moveItem(setCreateDraft, index, direction)}
                onRemove={() => removeItem(setCreateDraft, index)}
              />
            ))}
          </div>
        </div>

        <div className="stack-sm sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={resetCreateDraft}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
            disabled={createTemplate.isPending}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            disabled={createTemplate.isPending}
          >
            {createTemplate.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3 w-3" aria-hidden="true" />
            )}
            Save template
          </button>
        </div>
      </section>

      <section className="page-stack">
        <div className="section-card shadow-sm shadow-primary/5">
          <div className="stack-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Active templates</h2>
              <p className="text-sm text-muted-foreground">
                Edit, reorder, or archive templates that are ready for quoting.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Loading templates...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-foreground">
              {error.message}
            </div>
          ) : activeTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No templates yet. Create your first template above to streamline estimates.
            </div>
          ) : (
            <div className="page-stack">
              {activeTemplates.map((template) => {
                const isEditing = editingTemplateId === template.id;
                const draft = isEditing && editDraft ? editDraft : null;

                return (
                  <article key={template.id} className="section-card section-card--muted">
                    <div className="stack-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground/80">
                          {template.items.length} line item{template.items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="stack-sm sm:flex-row sm:items-center sm:gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(template)}
                          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => archive(template.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-accent hover:text-accent"
                          disabled={archiveTemplate.isPending && archiveTemplate.variables?.templateId === template.id}
                        >
                          {archiveTemplate.isPending && archiveTemplate.variables?.templateId === template.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          Archive
                        </button>
                      </div>
                    </div>

                    {isEditing && draft && (
                      <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Name
                            </label>
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(event) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, name: event.target.value } : prev,
                                )
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Description
                            </label>
                            <input
                              type="text"
                              value={draft.description}
                              onChange={(event) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, description: event.target.value } : prev,
                                )
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-foreground">Line items</h4>
                            <button
                              type="button"
                              onClick={() =>
                                setEditDraft((prev) =>
                                  prev
                                    ? { ...prev, items: [...prev.items, createEmptyItem()] }
                                    : prev,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                            >
                              <Plus className="h-3 w-3" aria-hidden="true" /> Add item
                            </button>
                          </div>
                          {draft.items.map((item, index) => (
                            <LineItemEditor
                              key={item.id ?? index}
                              index={index}
                              item={item}
                              totalItems={draft.items.length}
                              onChange={(next) =>
                                setEditDraft((prev) => {
                                  if (!prev) return prev;
                                  const items = [...prev.items];
                                  items[index] = next;
                                  return { ...prev, items };
                                })
                              }
                              onMove={(direction) =>
                                setEditDraft((prev) => {
                                  if (!prev) {
                                    return prev;
                                  }
                                  const items = [...prev.items];
                                  const target = index + direction;
                                  if (target < 0 || target >= items.length) {
                                    return prev;
                                  }
                                  [items[index], items[target]] = [items[target], items[index]];
                                  return { ...prev, items };
                                })
                              }
                              onRemove={() =>
                                setEditDraft((prev) => {
                                  if (!prev) return prev;
                                  const items = prev.items.filter((_, itemIndex) => itemIndex !== index);
                                  return { ...prev, items: items.length ? items : [createEmptyItem()] };
                                })
                              }
                            />
                          ))}
                        </div>

                        <div className="stack-sm sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                            disabled={updateTemplate.isPending}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleUpdate}
                            className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                            disabled={updateTemplate.isPending}
                          >
                            {updateTemplate.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Save className="h-3 w-3" aria-hidden="true" />
                            )}
                            Save changes
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="section-card shadow-sm shadow-primary/5">
          <h2 className="text-lg font-semibold text-foreground">Archived templates</h2>
          <p className="text-sm text-muted-foreground">
            Restore archived templates when you need them again or keep them for historical context.
          </p>

          {archivedTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No archived templates yet. Templates you archive will appear here.
            </div>
          ) : (
            <div className="page-stack">
              {archivedTemplates.map((template) => (
                <article key={template.id} className="section-card section-card--muted">
                  <div className="stack-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground/80">
                        {template.items.length} line item{template.items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restore(template.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                      disabled={restoreTemplate.isPending && restoreTemplate.variables?.templateId === template.id}
                    >
                      {restoreTemplate.isPending && restoreTemplate.variables?.templateId === template.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      )}
                      Restore
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type LineItemEditorProps = {
  index: number;
  item: TemplateDraftItem;
  totalItems: number;
  onChange: (next: TemplateDraftItem) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function LineItemEditor({
  index,
  item,
  totalItems,
  onChange,
  onMove,
  onRemove,
}: LineItemEditorProps) {
  return (
    <div className="stack-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3 rounded-2xl border border-border/60 bg-background px-3 py-3">
      <div className="flex-1 space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </label>
        <input
          type="text"
          value={item.description}
          onChange={(event) => onChange({ ...item, description: event.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Service description"
        />
      </div>
      <div className="grid w-full gap-2 sm:w-auto sm:min-w-[220px] sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quantity
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.quantity}
            onChange={(event) => onChange({ ...item, quantity: event.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unit price
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.unitPrice}
            onChange={(event) => onChange({ ...item, unitPrice: event.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMove(-1)}
          className="rounded-full border border-border p-2 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
          disabled={index === 0}
          aria-label="Move item up"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          className="rounded-full border border-border p-2 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
          disabled={index === totalItems - 1}
          aria-label="Move item down"
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full border border-border p-2 text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={totalItems === 1}
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
