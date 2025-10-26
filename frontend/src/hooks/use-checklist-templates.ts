"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type ChecklistTemplate = {
  id: string;
  name: string;
  description?: string | null;
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

async function fetchTemplates(): Promise<ChecklistTemplate[]> {
  const response = await fetch(`${API_BASE_URL}/checklists/templates`, {
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
    throw new Error(`Template delete failed (${response.status})`);
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

export function useChecklistTemplates() {
  return useQuery<ChecklistTemplate[], Error>({
    queryKey: ["checklist-templates"],
    queryFn: fetchTemplates,
  });
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, CreateChecklistTemplateInput>({
    mutationFn: createTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
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

export function useUpdateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, UpdateChecklistTemplateInput>({
    mutationFn: updateTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
    },
  });
}

export function useDeleteChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => deleteTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
    },
  });
}
