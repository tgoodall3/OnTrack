export type JobStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELED";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED";

export type TaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt?: string | null;
  checklistTemplateId?: string | null;
  assignee?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  metadata?: Record<string, unknown>;
};

export type CrewTaskSummary = TaskSummary & {
  jobId: string;
  jobNumber?: string | null;
  jobLabel?: string;
};

export type JobSummary = {
  id: string;
  status: JobStatus;
  notes?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    stage: string;
    contactName?: string | null;
  };
  estimate?: {
    id: string;
    number?: string | null;
    status: string;
  };
  property?: {
    id: string;
    address: string;
  };
  tasks?: TaskSummary[];
};
