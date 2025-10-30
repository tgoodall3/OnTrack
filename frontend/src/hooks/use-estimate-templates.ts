import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type EstimateTemplateItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  order: number;
};

export type EstimateTemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  items: EstimateTemplateItem[];
};

export type EstimateTemplatePayload = {
  name: string;
  description?: string | null;
  items: Array<{
    id?: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};

async function fetchTemplates(includeArchived: boolean): Promise<EstimateTemplateSummary[]> {
  const url = new URL(`${API_BASE_URL}/estimate-templates`);
  if (includeArchived) {
    url.searchParams.set("includeArchived", "true");
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

export function useEstimateTemplates(includeArchived = false) {
  return useQuery<EstimateTemplateSummary[], Error>({
    queryKey: ["estimate-templates", includeArchived ? "all" : "active"],
    queryFn: () => fetchTemplates(includeArchived),
  });
}

export function useApplyEstimateTemplate(estimateId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, { templateId: string }>({
    mutationFn: async ({ templateId }) => {
      const response = await fetch(`${API_BASE_URL}/estimate-templates/${templateId}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify({ estimateId }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Failed to apply template (${response.status})`);
      }

      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["estimates", estimateId] }),
        queryClient.invalidateQueries({ queryKey: ["estimates"] }),
      ]);
    },
  });
}

async function invalidateAllTemplateQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["estimate-templates"] });
  await queryClient.invalidateQueries({ queryKey: ["estimate-templates", "all"] });
  await queryClient.invalidateQueries({ queryKey: ["estimate-templates", "active"] });
}

export function useCreateEstimateTemplate() {
  const queryClient = useQueryClient();
  return useMutation<EstimateTemplateSummary, Error, EstimateTemplatePayload>({
    mutationFn: async (payload) => {
      const response = await fetch(`${API_BASE_URL}/estimate-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Failed to create template (${response.status})`);
      }

      return response.json();
    },
    onSuccess: async () => {
      await invalidateAllTemplateQueries(queryClient);
    },
  });
}

export function useUpdateEstimateTemplate(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation<EstimateTemplateSummary, Error, EstimateTemplatePayload>({
    mutationFn: async (payload) => {
      const response = await fetch(`${API_BASE_URL}/estimate-templates/${templateId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Failed to update template (${response.status})`);
      }

      return response.json();
    },
    onSuccess: async () => {
      await invalidateAllTemplateQueries(queryClient);
    },
  });
}

export function useArchiveEstimateTemplate() {
  const queryClient = useQueryClient();
  return useMutation<EstimateTemplateSummary, Error, { templateId: string }>({
    mutationFn: async ({ templateId }) => {
      const response = await fetch(`${API_BASE_URL}/estimate-templates/${templateId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Failed to archive template (${response.status})`);
      }

      return response.json();
    },
    onSuccess: async () => {
      await invalidateAllTemplateQueries(queryClient);
    },
  });
}

export function useRestoreEstimateTemplate() {
  const queryClient = useQueryClient();
  return useMutation<EstimateTemplateSummary, Error, { templateId: string }>({
    mutationFn: async ({ templateId }) => {
      const response = await fetch(`${API_BASE_URL}/estimate-templates/${templateId}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
      });

      if (!response.ok) {
        const message = await response.text().catch(() => null);
        throw new Error(message || `Failed to restore template (${response.status})`);
      }

      return response.json();
    },
    onSuccess: async () => {
      await invalidateAllTemplateQueries(queryClient);
    },
  });
}
