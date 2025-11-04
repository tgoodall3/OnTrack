import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialSummary, MaterialApprovalStatus } from "@/lib/types/materials";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type CreateMaterialPayload = {
  sku: string;
  costCode?: string;
  quantity: number;
  unitCost: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  recordedById?: string;
};

export type UpdateMaterialPayload = {
  jobId: string;
  entryId: string;
  updates: Partial<{
    sku: string;
    costCode: string | null;
    quantity: number;
    unitCost: number;
    notes: string | null;
    metadata: Record<string, unknown> | null;
  }>;
};

export type ApproveMaterialPayload = {
  jobId: string;
  entryId: string;
  approverId?: string;
  note?: string | null;
};

export type RejectMaterialPayload = {
  jobId: string;
  entryId: string;
  approverId?: string;
  reason: string;
  note?: string | null;
};

async function fetchJobMaterials(jobId: string, status?: MaterialApprovalStatus): Promise<MaterialSummary[]> {
  const url = new URL(`${API_BASE_URL}/jobs/${jobId}/materials`);
  if (status) {
    url.searchParams.set("status", status);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load materials (${response.status})`);
  }

  return response.json();
}

async function createMaterialRequest(jobId: string, payload: CreateMaterialPayload): Promise<MaterialSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/materials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to record material (${response.status})`);
  }

  return response.json();
}

async function updateMaterialRequest(payload: UpdateMaterialPayload): Promise<MaterialSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${payload.jobId}/materials/${payload.entryId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload.updates),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to update material (${response.status})`);
  }

  return response.json();
}

async function approveMaterialRequest(payload: ApproveMaterialPayload): Promise<MaterialSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${payload.jobId}/materials/${payload.entryId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({ approverId: payload.approverId, note: payload.note ?? undefined }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to approve material (${response.status})`);
  }

  return response.json();
}

async function rejectMaterialRequest(payload: RejectMaterialPayload): Promise<MaterialSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${payload.jobId}/materials/${payload.entryId}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({ approverId: payload.approverId, reason: payload.reason, note: payload.note ?? undefined }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to request material changes (${response.status})`);
  }

  return response.json();
}

export function useJobMaterials(jobId: string, options?: { status?: MaterialApprovalStatus; enabled?: boolean }) {
  return useQuery<MaterialSummary[], Error>({
    queryKey: ["jobs", jobId, "materials", options?.status ?? "all"],
    queryFn: () => fetchJobMaterials(jobId, options?.status),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateMaterial(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<MaterialSummary, Error, CreateMaterialPayload>({
    mutationFn: (payload) => createMaterialRequest(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "materials"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function useUpdateMaterial(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<MaterialSummary, Error, UpdateMaterialPayload>({
    mutationFn: updateMaterialRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "materials"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function useApproveMaterial(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<MaterialSummary, Error, ApproveMaterialPayload>({
    mutationFn: approveMaterialRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "materials"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function useRejectMaterial(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<MaterialSummary, Error, RejectMaterialPayload>({
    mutationFn: rejectMaterialRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "materials"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}
