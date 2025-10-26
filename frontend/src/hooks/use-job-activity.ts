"use client";

import { useQuery } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type JobActivityEntry = {
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

async function fetchJobActivity(jobId: string): Promise<JobActivityEntry[]> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/activity`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load job activity (${response.status})`);
  }

  return response.json();
}

export function useJobActivity(jobId: string | null, enabled = true) {
  return useQuery<JobActivityEntry[], Error>({
    queryKey: ["jobs", jobId, "activity"],
    queryFn: () => fetchJobActivity(jobId as string),
    enabled: enabled && !!jobId,
  });
}
