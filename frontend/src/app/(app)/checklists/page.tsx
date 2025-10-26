
"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, History, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ChecklistTemplate } from "@/hooks/use-checklist-templates";
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  useUpdateChecklistTemplate,
  useChecklistTemplateActivity,
  ChecklistTemplateActivityEntry,
} from "@/hooks/use-checklist-templates";
import { useToast } from "@/components/ui/use-toast";

const generateLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36);

type NewItem = {
  id: string;
  title: string;
};

type EditableItem = {
  key: string;
  id?: string;
  title: string;
};

const createBlankItem = (): NewItem => ({
  id: generateLocalId(),
  title: "",
});

const createEditableItem = (item?: { id?: string; title?: string }): EditableItem => ({
  key: item?.id ?? generateLocalId(),
  id: item?.id,
  title: item?.title ?? "",
});

export default function ChecklistsPage() {
  const { toast } = useToast();
  const { data: templates, isLoading, error, refetch } = useChecklistTemplates();
  const createMutation = useCreateChecklistTemplate();
  const updateMutation = useUpdateChecklistTemplate();
  const deleteMutation = useDeleteChecklistTemplate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<NewItem[]>([createBlankItem()]);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingItems, setEditingItems] = useState<EditableItem[]>([]);
  const [editingError, setEditingError] = useState<string | null>(null);

  const deletingTemplateId = deleteMutation.variables?.id ?? null;
  const editingIsPending = updateMutation.isPending || deleteMutation.isPending;

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

  const resetEditingState = () => {
    setEditingTemplateId(null);
    setEditingName("");
    setEditingDescription("");
    setEditingItems([]);
    setEditingError(null);
  };

  const beginEditingTemplate = (template: ChecklistTemplate) => {
    setEditingTemplateId(template.id);
    setEditingName(template.name);
    setEditingDescription(template.description ?? "");
    setEditingItems(
      [...template.items]
        .sort((a, b) => a.order - b.order)
        .map((item) => createEditableItem({ id: item.id, title: item.title })),
    );
    setEditingError(null);
  };

  const handleEditingAddItem = () => {
    setEditingItems((current) => [...current, createEditableItem()]);
  };

  const handleEditingItemChange = (key: string, value: string) => {
    setEditingItems((current) => current.map((item) => (item.key === key ? { ...item, title: value } : item)));
  };

  const handleEditingRemoveItem = (key: string) => {
    setEditingItems((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((item) => item.key !== key);
    });
  };

  const handleEditingMoveItem = (key: string, direction: number) => {
    setEditingItems((current) => {
      const index = current.findIndex((item) => item.key === key);
      if (index === -1) {
        return current;
      }
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleSaveEditing = () => {
    if (!editingTemplateId) return;

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setEditingError("Template name is required.");
      return;
    }

    const normalizedItems = editingItems.map((item) => ({
      id: item.id,
      title: item.title.trim(),
    }));

    if (normalizedItems.length === 0) {
      setEditingError("Add at least one checklist item.");
      return;
    }

    if (normalizedItems.some((item) => item.title.length === 0)) {
      setEditingError("All checklist items require a title.");
      return;
    }

    setEditingError(null);
    const descriptionValue = editingDescription.trim();

    updateMutation.mutate(
      {
        id: editingTemplateId,
        name: trimmedName,
        description: descriptionValue.length ? descriptionValue : null,
        items: normalizedItems.map((item) => ({
          id: item.id,
          title: item.title,
        })),
      },
      {
        onSuccess: (updated) => {
          toast({
            variant: "success",
            title: "Template updated",
            description: `${updated.name} saved.`,
          });
          resetEditingState();
          void refetch();
        },
        onError: (mutationError) => {
          setEditingError(mutationError.message);
        },
      },
    );
  };

  const handleCancelEditing = () => {
    if (updateMutation.isPending) return;
    resetEditingState();
  };

  const handleDeleteTemplate = (template: ChecklistTemplate) => {
    const confirmed = window.confirm(
      `Delete "${template.name}"? This will remove the template and detach it from any active jobs.`,
    );
    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(
      { id: template.id },
      {
        onSuccess: () => {
          toast({
            variant: "success",
            title: "Template deleted",
            description: `${template.name} removed.`,
          });
          if (editingTemplateId === template.id) {
            resetEditingState();
          }
          void refetch();
        },
        onError: (mutationError) => {
          toast({
            variant: "destructive",
            title: "Template delete failed",
            description: mutationError.message,
          });
        },
      },
    );
  };

  useEffect(() => {
    if (!editingTemplateId) {
      return;
    }

    if (!templates?.some((template) => template.id === editingTemplateId)) {
      resetEditingState();
    }
  }, [editingTemplateId, templates]);

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
          templates.map((template) => {
            const isEditing = editingTemplateId === template.id;
            return (
              <article
                key={template.id}
                className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm shadow-primary/5"
              >
                {isEditing ? (
                  <div className="space-y-4">
                    <header className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-foreground">Editing {template.name}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Reorder items and update the copy before saving.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(template)}
                          className="inline-flex items-center gap-2 rounded-full border border-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent transition hover:bg-accent/10 disabled:opacity-60"
                          disabled={editingIsPending || deletingTemplateId === template.id}
                        >
                          {deleteMutation.isPending && deletingTemplateId === template.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          Delete template
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEditing}
                          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
                          disabled={editingIsPending}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                          Cancel
                        </button>
                      </div>
                    </header>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Template name
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          placeholder="Checklist name"
                          disabled={editingIsPending}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Description
                        <input
                          type="text"
                          value={editingDescription}
                          onChange={(event) => setEditingDescription(event.target.value)}
                          className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          placeholder="Optional summary"
                          disabled={editingIsPending}
                        />
                      </label>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
                      <header className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Checklist items
                        </span>
                        <button
                          type="button"
                          onClick={handleEditingAddItem}
                          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
                          disabled={editingIsPending}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          Add item
                        </button>
                      </header>
                      <div className="space-y-2">
                        {editingItems.map((item, index) => (
                          <div
                            key={item.key}
                            className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background px-3 py-2"
                          >
                            <span className="text-xs font-semibold text-muted-foreground">{index + 1}.</span>
                            <input
                              type="text"
                              value={item.title}
                              onChange={(event) => handleEditingItemChange(item.key, event.target.value)}
                              className="flex-1 min-w-[200px] rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                              placeholder="Describe the step to complete"
                              disabled={editingIsPending}
                            />
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditingMoveItem(item.key, -1)}
                                className="inline-flex items-center rounded-full border border-border p-2 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                                disabled={editingIsPending || index === 0}
                                aria-label="Move item up"
                              >
                                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditingMoveItem(item.key, 1)}
                                className="inline-flex items-center rounded-full border border-border p-2 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                                disabled={editingIsPending || index === editingItems.length - 1}
                                aria-label="Move item down"
                              >
                                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditingRemoveItem(item.key)}
                                className="inline-flex items-center rounded-full border border-border p-2 text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-50"
                                disabled={editingIsPending || editingItems.length === 1}
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {editingError && <p className="text-sm text-accent">{editingError}</p>}

                    <button
                      type="button"
                      onClick={handleSaveEditing}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                      disabled={editingIsPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Save changes
                    </button>

                    <TemplateActivityFeed templateId={template.id} />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{template.name}</p>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {template.items.length} item{template.items.length === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          onClick={() => beginEditingTemplate(template)}
                          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(template)}
                          className="inline-flex items-center gap-2 rounded-full border border-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent transition hover:bg-accent/10 disabled:opacity-60"
                          disabled={deletingTemplateId === template.id && deleteMutation.isPending}
                        >
                          {deleteMutation.isPending && deletingTemplateId === template.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          Delete
                        </button>
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {template.items.map((item) => (
                        <li key={item.id} className="rounded-2xl bg-muted/30 px-3 py-2">
                          <span className="font-semibold text-foreground">{item.title}</span>
                        </li>
                      ))}
                    </ul>

                    <TemplateActivityFeed templateId={template.id} />
                  </>
                )}
              </article>
            );
          })
        ) : (
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No templates yet. Create your first checklist above to standardize your job workflows.
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateActivityFeed({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useChecklistTemplateActivity(open ? templateId : null, open);

  useEffect(() => {
    if (open) {
      void refetch();
    }
  }, [open, refetch]);

  const entries = data ?? [];

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        <History className="h-3 w-3" aria-hidden="true" />
        {open ? "Hide activity" : "View activity"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {error ? (
            <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent-foreground">
              {error.message}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
                  <p className="font-semibold text-foreground">{describeTemplateActivity(entry)}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                    {formatTemplateActor(entry)} • {formatRelativeTimeFromNow(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}

function describeTemplateActivity(entry: ChecklistTemplateActivityEntry): string {
  const meta = toRecord(entry.meta);
  switch (entry.action) {
    case "checklist.template_created":
      return `Template created${meta?.itemCount ? ` (${meta.itemCount} items)` : ""}`;
    case "checklist.template_updated": {
      if (!meta) {
        return "Template updated";
      }
      const changes: string[] = [];
      if (meta.nameChanged) {
        changes.push("name");
      }
      if (meta.descriptionChanged) {
        changes.push("description");
      }
      const added = Number(meta.addedItemCount ?? 0);
      const removed = Number(meta.removedItemCount ?? 0);
      const modified = Number(meta.modifiedItemCount ?? 0);
      if (added > 0) {
        changes.push(`${added} added`);
      }
      if (removed > 0) {
        changes.push(`${removed} removed`);
      }
      if (modified > 0) {
        changes.push(`${modified} updated`);
      }
      if (changes.length === 0) {
        return "Template updated";
      }
      return `Template updated (${changes.join(", ")})`;
    }
    case "checklist.template_deleted":
      return "Template deleted";
    default:
      return entry.action
        .split(/[._]/)
        .filter(Boolean)
        .map(capitalize)
        .join(" ");
  }
}

function formatTemplateActor(entry: ChecklistTemplateActivityEntry): string {
  return entry.actor?.name ?? entry.actor?.email ?? "System";
}

function formatRelativeTimeFromNow(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return "";
  }
  const now = Date.now();
  const diff = target - now;
  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(seconds) < 60) {
    return formatter.format(Math.trunc(seconds), "second");
  }
  if (Math.abs(minutes) < 60) {
    return formatter.format(Math.trunc(minutes), "minute");
  }
  if (Math.abs(hours) < 24) {
    return formatter.format(Math.trunc(hours), "hour");
  }
  if (Math.abs(days) < 7) {
    return formatter.format(Math.trunc(days), "day");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(target));
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
