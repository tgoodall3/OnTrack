export type TimeEntryStatus =
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "ADJUSTMENT_REQUESTED";

export type TimeEntryLocationSummary = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturedAt?: string | null;
};

export type TimeEntrySummary = {
  id: string;
  jobId: string;
  userId: string;
  status: TimeEntryStatus;
  clockIn: string;
  clockOut: string | null;
  durationSeconds: number | null;
  durationMinutes: number | null;
  clockInLocation: TimeEntryLocationSummary | null;
  clockOutLocation: TimeEntryLocationSummary | null;
  notes: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  submittedById: string | null;
  approverId: string | null;
  createdAt: string;
  updatedAt: string;
};
