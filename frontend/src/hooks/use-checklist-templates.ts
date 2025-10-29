"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type ChecklistTemplate = {
  id: string;
  name: string;
  description?: string | null;
  isArchived: boolean;
  jobUsageCount: number;
  taskUsageCount: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    title: string;
    order: number;
  }>;
};

export type CreateChecklistTemplateInput = {
  name: string;
  description?: string;
  items: Array<{ title: string }>;
};

export type UpdateChecklistTemplateInput = {
  id: string;
  name?: string;
  description?: string | null;
  items: Array<{ id?: string; title: string }>;
};

export type ChecklistTemplateActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  actor?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  meta?: unknown;
};

export type ChecklistTemplateUsageJob = {
  jobId: string;
  jobStatus: string;
  jobLabel: string;
  taskCount: number;
  sampleTasks: Array<{
    id: string;
    title: string;
    status: string;
  }>;
};

export type ChecklistTemplateUsage = {
  template: {
    id: string;
    name: string;
  };
  totalJobs: number;
  totalTasks: number;
  jobs: ChecklistTemplateUsageJob[];
};

async function fetchTemplates(archived = false): Promise<ChecklistTemplate[]> {
  const url = new URL(`${API_BASE_URL}/checklists/templates`);
  if (archived) {
    url.searchParams.set("archived", "true");
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load templates (${response.status})`);
  }

  return response.json();
}

async function createTemplate(payload: CreateChecklistTemplateInput): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Template creation failed (${response.status})`);
  }

  return response.json();
}

async function updateTemplate({
  id,
  ...payload
}: UpdateChecklistTemplateInput): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Template update failed (${response.status})`);
  }

  return response.json();
}

async function deleteTemplate(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates/${id}`, {
    method: "DELETE",
    headers: {
      "X-Tenant-ID": TENANT_HEADER,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Template delete failed (${response.status})`);
  }
}

async function fetchTemplateActivity(templateId: string): Promise<ChecklistTemplateActivityEntry[]> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates/${templateId}/activity`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load template activity (${response.status})`);
  }

  return response.json();
}

async function fetchTemplateUsage(templateId: string): Promise<ChecklistTemplateUsage> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates/${templateId}/usage`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to load template usage (${response.status})`);
  }

  return response.json();
}

async function archiveTemplate(id: string): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates/${id}/archive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Template archive failed (${response.status})`);
  }

  return response.json();
}

async function restoreTemplate(id: string): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates/${id}/restore`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Template restore failed (${response.status})`);
  }

  return response.json();
}

export function useChecklistTemplates(options?: { archived?: boolean }) {
  const archived = options?.archived ?? false;
  return useQuery<ChecklistTemplate[], Error>({
    queryKey: ["checklist-templates", archived ? "archived" : "active"],
    queryFn: () => fetchTemplates(archived),
  });
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, CreateChecklistTemplateInput>({
    mutationFn: createTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates", "archived"] });
    },
  });
}

export function useChecklistTemplateActivity(templateId: string | null, enabled = true) {
  return useQuery<ChecklistTemplateActivityEntry[], Error>({
    queryKey: ["checklist-templates", templateId, "activity"],
    queryFn: () => fetchTemplateActivity(templateId as string),
    enabled: enabled && !!templateId,
  });
}

export function useChecklistTemplateUsage(templateId: string | null, enabled = true) {
  return useQuery<ChecklistTemplateUsage, Error>({
    queryKey: ["checklist-templates", templateId, "usage"],
    queryFn: () => fetchTemplateUsage(templateId as string),
    enabled: enabled && !!templateId,
  });
}

export function useUpdateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, UpdateChecklistTemplateInput>({
    mutationFn: updateTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates", "archived"] });
    },
  });
}

export function useDeleteChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => deleteTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates", "archived"] });
    },
  });
}

export function useArchiveChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, { id: string }>({
    mutationFn: ({ id }) => archiveTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates", "archived"] });
    },
  });
}

export function useRestoreChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, { id: string }>({
    mutationFn: ({ id }) => restoreTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates", "archived"] });
    },
  });
}
