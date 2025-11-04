import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TimeEntrySummary, TimeEntryStatus } from "@/lib/types/time-entries";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

async function fetchJobTimeEntries(jobId: string): Promise<TimeEntrySummary[]> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/time-entries`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load time entries (${response.status})`);
  }

  return response.json();
}

type ApprovePayload = {
  jobId: string;
  entryId: string;
  approverId?: string;
  note?: string;
};

type RejectPayload = {
  jobId: string;
  entryId: string;
  approverId?: string;
  reason: string;
  note?: string;
};

type ClockInPayload = {
  jobId: string;
  userId?: string;
  clockIn?: string;
  notes?: string;
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
};

type ClockOutPayload = {
  jobId: string;
  entryId: string;
  userId?: string;
  clockOut?: string;
  notes?: string;
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
};

async function clockInRequest(payload: ClockInPayload): Promise<TimeEntrySummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${payload.jobId}/time-entries/clock-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({
      userId: payload.userId,
      clockIn: payload.clockIn,
      notes: payload.notes,
      location: payload.location,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to clock in (${response.status})`);
  }

  return response.json();
}

async function clockOutRequest(payload: ClockOutPayload): Promise<TimeEntrySummary> {
  const response = await fetch(
    `${API_BASE_URL}/jobs/${payload.jobId}/time-entries/${payload.entryId}/clock-out`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_HEADER,
      },
      body: JSON.stringify({
        userId: payload.userId,
        clockOut: payload.clockOut,
        notes: payload.notes,
        location: payload.location,
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to clock out (${response.status})`);
  }

  return response.json();
}

async function approveTimeEntryRequest(payload: ApprovePayload): Promise<TimeEntrySummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${payload.jobId}/time-entries/${payload.entryId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({
      approverId: payload.approverId,
      note: payload.note,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to approve time entry (${response.status})`);
  }

  return response.json();
}

async function rejectTimeEntryRequest(payload: RejectPayload): Promise<TimeEntrySummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${payload.jobId}/time-entries/${payload.entryId}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({
      approverId: payload.approverId,
      reason: payload.reason,
      note: payload.note,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to request adjustments (${response.status})`);
  }

  return response.json();
}

export function useJobTimeEntries(jobId: string, enabled = true) {
  return useQuery<TimeEntrySummary[], Error>({
    queryKey: ["jobs", jobId, "time-entries"],
    queryFn: () => fetchJobTimeEntries(jobId),
    enabled,
  });
}

export function useClockInTimeEntry(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<TimeEntrySummary, Error, ClockInPayload>({
    mutationFn: clockInRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "time-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function useClockOutTimeEntry(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<TimeEntrySummary, Error, ClockOutPayload>({
    mutationFn: clockOutRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "time-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function useApproveTimeEntry(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<TimeEntrySummary, Error, ApprovePayload>({
    mutationFn: approveTimeEntryRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "time-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function useRejectTimeEntry(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<TimeEntrySummary, Error, RejectPayload>({
    mutationFn: rejectTimeEntryRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "time-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });
}

export function isApprovableStatus(status: TimeEntryStatus) {
  return status === "SUBMITTED" || status === "ADJUSTMENT_REQUESTED";
}

export function isRejectableStatus(status: TimeEntryStatus) {
  return status === "SUBMITTED";
}
