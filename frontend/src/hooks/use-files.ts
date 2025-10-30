import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type FileType = "IMAGE" | "DOCUMENT" | "VIDEO" | "OTHER";

export type FileScanStatus = "PENDING" | "CLEAN" | "INFECTED" | "FAILED";

export type UploadedFileSummary = {
  id: string;
  url: string;
  type: FileType;
  createdAt: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  scanStatus: FileScanStatus;
  scanMessage?: string | null;
  processedAt?: string | null;
  isProcessing: boolean;
  jobId?: string | null;
  estimateId?: string | null;
  invoiceId?: string | null;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  dominantColor?: string | null;
  uploadedBy?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

export type FileScope = {
  jobId?: string;
  estimateId?: string;
  invoiceId?: string;
};

export type CreateUploadRequest = FileScope & {
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export type CreateUploadResponse = {
  key: string;
  uploadUrl: string;
  expiresIn: number;
  headers: Record<string, string>;
  maxUploadBytes: number;
};

export type CompleteUploadRequest = FileScope & {
  key: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

function buildFilesEndpoint(scope: FileScope): string | null {
  if (scope.jobId) {
    return `${API_BASE_URL}/jobs/${scope.jobId}/files`;
  }
  if (scope.estimateId) {
    return `${API_BASE_URL}/estimates/${scope.estimateId}/files`;
  }
  if (scope.invoiceId) {
    return `${API_BASE_URL}/invoices/${scope.invoiceId}/files`;
  }
  return null;
}

function buildQueryKey(scope: FileScope) {
  if (scope.jobId) return ["jobs", scope.jobId, "files"] as const;
  if (scope.estimateId) return ["estimates", scope.estimateId, "files"] as const;
  if (scope.invoiceId) return ["invoices", scope.invoiceId, "files"] as const;
  return ["files", "unknown"] as const;
}

function mergeScope(base: FileScope, override: FileScope): FileScope {
  return {
    jobId: override.jobId ?? base.jobId,
    estimateId: override.estimateId ?? base.estimateId,
    invoiceId: override.invoiceId ?? base.invoiceId,
  };
}

async function fetchFiles(scope: FileScope): Promise<UploadedFileSummary[]> {
  const endpoint = buildFilesEndpoint(scope);
  if (!endpoint) {
    throw new Error("Unsupported file scope");
  }

  const response = await fetch(endpoint, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load files (${response.status})`);
  }

  return response.json();
}

async function requestUpload(payload: CreateUploadRequest): Promise<CreateUploadResponse> {
  const response = await fetch(`${API_BASE_URL}/files/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Upload request failed (${response.status})`);
  }

  return response.json();
}

async function finalizeUpload(payload: CompleteUploadRequest): Promise<UploadedFileSummary> {
  const response = await fetch(`${API_BASE_URL}/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to save file (${response.status})`);
  }

  return response.json();
}

async function deleteFile(fileId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
    method: "DELETE",
    headers: {
      "X-Tenant-ID": TENANT_HEADER,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to delete file (${response.status})`);
  }
}

export function useFiles(scope: FileScope) {
  const normalized = {
    jobId: scope.jobId ?? undefined,
    estimateId: scope.estimateId ?? undefined,
    invoiceId: scope.invoiceId ?? undefined,
  };
  const hasScope = Boolean(normalized.jobId || normalized.estimateId || normalized.invoiceId);

  return useQuery<UploadedFileSummary[], Error>({
    queryKey: buildQueryKey(normalized),
    queryFn: () => fetchFiles(normalized),
    enabled: hasScope,
  });
}

export function useJobFiles(jobId: string | null) {
  return useFiles({ jobId: jobId ?? undefined });
}

export function useEstimateFiles(estimateId: string | null) {
  return useFiles({ estimateId: estimateId ?? undefined });
}

export function useFileUploadMutations(scope: FileScope) {
  const queryClient = useQueryClient();
  const baseScope: FileScope = {
    jobId: scope.jobId ?? undefined,
    estimateId: scope.estimateId ?? undefined,
    invoiceId: scope.invoiceId ?? undefined,
  };

  const invalidateScope = (target: FileScope) => {
    const merged = mergeScope(baseScope, target);
    const key = buildQueryKey(merged);
    return queryClient.invalidateQueries({ queryKey: key }).catch(() => {
      // noop
    });
  };

  const uploadRequestMutation = useMutation<CreateUploadResponse, Error, CreateUploadRequest>({
    mutationFn: requestUpload,
  });

  const finalizeMutation = useMutation<UploadedFileSummary, Error, CompleteUploadRequest>({
    mutationFn: finalizeUpload,
    onSuccess: (_file, variables) => {
      void invalidateScope(variables);
    },
  });

  const deleteMutation = useMutation<void, Error, { fileId: string } & FileScope>({
    mutationFn: ({ fileId }) => deleteFile(fileId),
    onSuccess: (_result, variables) => {
      void invalidateScope(variables);
    },
  });

  return {
    uploadRequestMutation,
    finalizeMutation,
    deleteMutation,
    scope: baseScope,
  };
}
