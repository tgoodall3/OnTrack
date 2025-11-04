export type MaterialApprovalStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export type MaterialSummary = {
  id: string;
  jobId: string;
  sku: string;
  costCode: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  approvalStatus: MaterialApprovalStatus;
  notes: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown> | null;
  recordedBy: {
    id: string;
    name?: string | null;
  } | null;
  approver: {
    id: string;
    name?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};
