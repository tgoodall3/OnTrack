"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Timer, Plus, CheckCircle2, Circle, ClipboardCheck, History } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { useTeamMembers, TeamMember } from "@/hooks/use-team-members";
import { ChecklistTemplate, useChecklistTemplates } from "@/hooks/use-checklist-templates";
import { JobActivityEntry, useJobActivity } from "@/hooks/use-job-activity";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

type JobStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELED";

type JobSummary = {
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

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED";

type TaskSummary = {
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

type CreateTaskInput = {
  jobId: string;
  title: string;
  assigneeId?: string;
  dueAt?: string;
};

type UpdateTaskInput = {
  jobId: string;
  taskId: string;
  updates: Partial<Pick<TaskSummary, "title" | "status">> & {
    assigneeId?: string | null;
    dueAt?: string | null;
  };
};

type UpdateJobStatusInput = {
  jobId: string;
  status: JobStatus;
  actualStart?: string | null;
  actualEnd?: string | null;
};

type RemoveTemplateInput = {
  jobId: string;
  templateId: string;
  suppressToast?: boolean;
};

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
  CANCELED: "Canceled",
};

const JOB_STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = Object.entries(JOB_STATUS_LABELS).map(
  ([value, label]) => ({
    value: value as JobStatus,
    label,
  }),
);

type JobFilter = JobStatus | "ALL";

const JOB_FILTER_OPTIONS: Array<{ value: JobFilter; label: string }> = [
  { value: "ALL", label: "All" },
  ...JOB_STATUS_OPTIONS,
];

async function fetchJobs(): Promise<JobSummary[]> {
  const response = await fetch(`${API_BASE_URL}/jobs`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load jobs: ${response.status}`);
  }

  return response.json();
}

async function fetchTasks(jobId: string): Promise<TaskSummary[]> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/tasks`, {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load tasks: ${response.status}`);
  }

  return response.json();
}

async function createTask({ jobId, ...payload }: CreateTaskInput): Promise<TaskSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Task creation failed: ${response.status}`);
  }

  return response.json();
}

async function updateTask({ jobId, taskId, updates }: UpdateTaskInput): Promise<TaskSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Task update failed: ${response.status}`);
  }

  return response.json();
}

async function deleteTask({ jobId, taskId }: { jobId: string; taskId: string }): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/tasks/${taskId}`, {
    method: "DELETE",
    headers: {
      "X-Tenant-ID": TENANT_HEADER,
    },
  });

  if (!response.ok) {
    throw new Error(`Task delete failed: ${response.status}`);
  }
}

async function updateJobStatus({ jobId, ...payload }: UpdateJobStatusInput): Promise<JobSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Job update failed: ${response.status}`);
  }

  return response.json();
}

export default function WorkPage() {
  return (
    <Suspense fallback={<WorkPageSkeleton />}>
      <WorkPageContent />
    </Suspense>
  );
}

function WorkPageContent() {
  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery<JobSummary[], Error>({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
  });

  const {
    data: teamMembersData,
    isLoading: teamMembersLoading,
    error: teamMembersError,
  } = useTeamMembers();

  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const statusFromQuery = useMemo<JobFilter>(() => {
    const param = searchParams.get("status");
    if (!param) return "ALL";
    const upper = param.toUpperCase();
    if (upper === "ALL") return "ALL";
    return JOB_STATUS_OPTIONS.some((option) => option.value === upper)
      ? (upper as JobFilter)
      : "ALL";
  }, [searchParams]);

  const queryClient = useQueryClient();
  const [creatingForJob, setCreatingForJob] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>("");
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilterState] = useState<JobFilter>(statusFromQuery);

  useEffect(() => {
    setStatusFilterState((previous) => (previous === statusFromQuery ? previous : statusFromQuery));
  }, [statusFromQuery]);

  const handleStatusFilterChange = (value: JobFilter) => {
    setStatusFilterState(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("status");
    } else {
      params.set("status", value.toLowerCase());
    }
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  };

  type TaskQueryKey = ["jobs", string, "tasks"];

  const teamMembers = teamMembersData ?? [];
  const { data: checklistTemplatesData, isLoading: checklistTemplatesLoading, error: checklistTemplatesError } = useChecklistTemplates();
  const checklistTemplates = checklistTemplatesData ?? [];

  const [applyingTemplateJobId, setApplyingTemplateJobId] = useState<string | null>(null);
  const [jobTemplateById, setJobTemplateById] = useState<Record<string, { id: string; name: string }>>({});

  const handleTemplateResolved = useCallback((jobId: string, template: ChecklistTemplate | null) => {
    setJobTemplateById((current) => {
      const nextValue = template ? { id: template.id, name: template.name } : undefined;
      const existing = current[jobId];
      const isUnchanged =
        (existing === undefined && nextValue === undefined) ||
        (existing !== undefined && nextValue !== undefined && existing.id === nextValue.id && existing.name === nextValue.name);

      if (isUnchanged) {
        return current;
      }

      const next = { ...current };
      if (nextValue) {
        next[jobId] = nextValue;
      } else {
        delete next[jobId];
      }
      return next;
    });
  }, []);


  const createTaskMutation = useMutation<TaskSummary, Error, CreateTaskInput, { previousTasks?: TaskSummary[]; key: TaskQueryKey; optimisticId: string }>({
    mutationFn: createTask,
    onMutate: async (input) => {
      setTaskError(null);
      const key: TaskQueryKey = ["jobs", input.jobId, "tasks"];
      await queryClient.cancelQueries({ queryKey: key });
      const previousTasks = queryClient.getQueryData<TaskSummary[]>(key) ?? [];
      const optimisticId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `temp-${Math.random().toString(36).slice(2)}`;
      const optimisticAssignee = toTaskAssignee(
        input.assigneeId ? teamMembers.find((member) => member.id === input.assigneeId) : undefined,
      );

      const optimisticTask: TaskSummary = {
        id: optimisticId,
        title: input.title,
        status: "PENDING",
        dueAt: input.dueAt ?? null,
        checklistTemplateId: undefined,
        assignee: optimisticAssignee,
        metadata: undefined,
      };
      queryClient.setQueryData<TaskSummary[]>(key, [...previousTasks, optimisticTask]);
      return { previousTasks, key, optimisticId };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.key, context.previousTasks);
      }
      setTaskError(mutationError.message);
      toast({
        variant: "destructive",
        title: "Failed to create task",
        description: mutationError.message,
      });
    },
    onSuccess: (task, _variables, context) => {
      if (context) {
        queryClient.setQueryData<TaskSummary[]>(context.key, (tasks = []) =>
          tasks.map((existing) => (existing.id === context.optimisticId ? task : existing)),
        );
      }
      toast({
        variant: "success",
        title: "Task added",
        description: "Crew schedule updated.",
      });
      setNewTaskTitle("");
      setNewTaskAssigneeId("");
      setNewTaskDueDate("");
      setCreatingForJob(null);
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ["jobs", variables.jobId, "tasks"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const updateTaskMutation = useMutation<TaskSummary, Error, UpdateTaskInput, { previousTasks?: TaskSummary[]; key: TaskQueryKey }>({
    mutationFn: updateTask,
    onMutate: async (input) => {
      const key: TaskQueryKey = ["jobs", input.jobId, "tasks"];
      await queryClient.cancelQueries({ queryKey: key });
      const previousTasks = queryClient.getQueryData<TaskSummary[]>(key) ?? [];
      queryClient.setQueryData<TaskSummary[]>(key, previousTasks.map((task) => {
        if (task.id !== input.taskId) {
          return task;
        }

        const next: TaskSummary = { ...task };

        if (input.updates.title !== undefined) {
          next.title = input.updates.title;
        }

        if (input.updates.status !== undefined) {
          next.status = input.updates.status ?? task.status;
        }

        if (input.updates.dueAt !== undefined) {
          next.dueAt = input.updates.dueAt ?? null;
        }

        if (input.updates.assigneeId !== undefined) {
          next.assignee = toTaskAssignee(
            input.updates.assigneeId
              ? teamMembers.find((member) => member.id === input.updates.assigneeId)
              : undefined,
          );
        }

        return next;
      }));
      return { previousTasks, key };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.key, context.previousTasks);
      }
      toast({
        variant: "destructive",
        title: "Failed to update task",
        description: mutationError.message,
      });
    },
    onSuccess: (task, _variables, context) => {
      if (context) {
        queryClient.setQueryData<TaskSummary[]>(context.key, (tasks = []) =>
          tasks.map((existing) => (existing.id === task.id ? task : existing)),
        );
      }
      toast({
        variant: "success",
        title: "Task updated",
      });
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ["jobs", variables.jobId, "tasks"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const deleteTaskMutation = useMutation<void, Error, { jobId: string; taskId: string }, { previousTasks?: TaskSummary[]; key: TaskQueryKey }>({
    mutationFn: deleteTask,
    onMutate: async (input) => {
      const key: TaskQueryKey = ["jobs", input.jobId, "tasks"];
      await queryClient.cancelQueries({ queryKey: key });
      const previousTasks = queryClient.getQueryData<TaskSummary[]>(key) ?? [];
      queryClient.setQueryData<TaskSummary[]>(key, previousTasks.filter((task) => task.id !== input.taskId));
      return { previousTasks, key };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.key, context.previousTasks);
      }
      toast({
        variant: "destructive",
        title: "Failed to remove task",
        description: mutationError.message,
      });
    },
    onSuccess: (_result, _variables) => {
      toast({
        variant: "success",
        title: "Task removed",
      });
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ["jobs", variables.jobId, "tasks"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const updateJobStatusMutation = useMutation<JobSummary, Error, UpdateJobStatusInput, { previousJobs?: JobSummary[] }>({
    mutationFn: updateJobStatus,
    onMutate: async (input) => {
      setStatusUpdatingId(input.jobId);
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previousJobs = queryClient.getQueryData<JobSummary[]>(["jobs"]);
      if (previousJobs) {
        queryClient.setQueryData<JobSummary[]>(["jobs"], previousJobs.map((job) => {
          if (job.id !== input.jobId) {
            return job;
          }

          const nextJob: JobSummary = {
            ...job,
            status: input.status,
          };

          if (input.actualStart !== undefined) {
            nextJob.actualStart = input.actualStart ?? null;
          }

          if (input.actualEnd !== undefined) {
            nextJob.actualEnd = input.actualEnd ?? null;
          }

          return nextJob;
        }));
      }
      return { previousJobs };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previousJobs) {
        queryClient.setQueryData(["jobs"], context.previousJobs);
      }
      toast({
        variant: "destructive",
        title: "Failed to update job",
        description: mutationError.message,
      });
    },
    onSuccess: (job) => {
      queryClient.setQueryData<JobSummary[]>(["jobs"], (current) =>
        current?.map((existing) => (existing.id === job.id ? job : existing)),
      );
      toast({
        variant: "success",
        title: "Job updated",
      });
    },
    onSettled: () => {
      setStatusUpdatingId(null);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
  });

  const applyTemplateMutation = useMutation<void, Error, { jobId: string; templateId: string }>({
    mutationFn: async ({ jobId, templateId }) => {
      const response = await fetch(`${API_BASE_URL}/checklists/templates/${templateId}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to apply template (${response.status})`);
      }
    },
    onError: (mutationError) => {
      toast({
        variant: "destructive",
        title: "Template apply failed",
        description: mutationError.message,
      });
    },
    onSuccess: (_result, variables) => {
      toast({
        variant: "success",
        title: "Checklist added",
        description: "Tasks loaded from template.",
      });
      void queryClient.invalidateQueries({ queryKey: ["jobs", variables.jobId, "tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const removeTemplateMutation = useMutation<void, Error, RemoveTemplateInput>({
    mutationFn: async ({ jobId, templateId }) => {
      const response = await fetch(`${API_BASE_URL}/checklists/templates/${templateId}/apply`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_HEADER,
        },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to remove template (${response.status})`);
      }
    },
    onError: (mutationError) => {
      toast({
        variant: "destructive",
        title: "Failed to remove checklist",
        description: mutationError.message,
      });
    },
    onSuccess: (_result, variables) => {
      if (!variables.suppressToast) {
        toast({
          variant: "success",
          title: "Checklist removed",
          description: "Template tasks cleared from job.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["jobs", variables.jobId, "tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const jobs = data ?? [];
  const hasJobs = jobs.length > 0;
  const showLoading = isLoading || isFetching;
  const errorMessage = error?.message ?? null;

  const jobCounts = useMemo(() => {
    const counts: Record<JobFilter, number> = {
      ALL: jobs.length,
      DRAFT: 0,
      SCHEDULED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      ON_HOLD: 0,
      CANCELED: 0,
    };

    for (const job of jobs) {
      counts[job.status] += 1;
    }

    return counts;
  }, [jobs]);

  const filteredJobs = statusFilter === "ALL" ? jobs : jobs.filter((job) => job.status === statusFilter);
  const hasFilteredJobs = filteredJobs.length > 0;

  const handleJobStatusChange = (job: JobSummary, status: JobStatus) => {
    const payload: UpdateJobStatusInput = {
      jobId: job.id,
      status,
    };

    const nowIso = new Date().toISOString();

    switch (status) {
      case "IN_PROGRESS":
        payload.actualStart = job.actualStart ?? nowIso;
        payload.actualEnd = null;
        break;
      case "COMPLETED":
        payload.actualStart = job.actualStart ?? nowIso;
        payload.actualEnd = job.actualEnd ?? nowIso;
        break;
      case "DRAFT":
      case "SCHEDULED":
        payload.actualStart = null;
        payload.actualEnd = null;
        break;
      case "ON_HOLD":
      case "CANCELED":
        payload.actualEnd = null;
        break;
      default:
        break;
    }

    updateJobStatusMutation.mutate(payload);
  };

  const handleApplyTemplate = async (
    jobId: string,
    templateId: string,
    options?: { replaceTemplateId?: string },
  ): Promise<boolean> => {
    if (!templateId) {
      toast({
        variant: "destructive",
        title: "Select a template",
        description: "Choose a checklist template before applying.",
      });
      return false;
    }

    setApplyingTemplateJobId(jobId);

    try {
      if (options?.replaceTemplateId) {
        await removeTemplateMutation.mutateAsync({
          jobId,
          templateId: options.replaceTemplateId,
          suppressToast: true,
        });
      }

      await applyTemplateMutation.mutateAsync({ jobId, templateId });
      return true;
    } catch {
      return false;
    } finally {
      setApplyingTemplateJobId(null);
    }
  };

  const handleRemoveTemplate = async (jobId: string, templateId: string): Promise<boolean> => {
    setApplyingTemplateJobId(jobId);

    try {
      await removeTemplateMutation.mutateAsync({ jobId, templateId });
      return true;
    } catch {
      return false;
    } finally {
      setApplyingTemplateJobId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Work Orders</h1>
          <p className="text-sm text-muted-foreground">
            Monitor scheduled jobs, crews in progress, and recently completed work.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Timer className="h-4 w-4 text-primary" />
          {jobs.length} jobs
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {errorMessage}
        </div>
      )}

      {showLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading jobs...
        </div>
      ) : !hasJobs ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No jobs yet. Once estimates are approved and scheduled, they will appear here.
        </div>
      ) : (
        <section className="space-y-4">
          <JobStatusFilters
            options={JOB_FILTER_OPTIONS}
            counts={jobCounts}
            active={statusFilter}
            onChange={handleStatusFilterChange}
          />

          {hasFilteredJobs ? (
            filteredJobs.map((job) => {
              const appliedTemplateMeta = jobTemplateById[job.id];
              return (
                <article
                  key={job.id}
                  className="rounded-3xl border border-border bg-surface p-6 shadow-md shadow-primary/10 transition hover:border-primary/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {job.lead?.contactName ?? "Field assignment"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {job.estimate?.number ?? "Unscheduled estimate"} - {job.lead?.stage.replace("_", " ") ?? "Lead"}
                      </p>
                      {job.property && (
                        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                          <MapPin className="h-4 w-4 text-primary" />
                          {job.property.address}
                        </p>
                      )}
                      {appliedTemplateMeta && (
                        <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <ClipboardCheck className="h-3 w-3 text-primary" aria-hidden="true" />
                          {appliedTemplateMeta.name}
                        </span>
                      )}
                    </div>
                    <JobStatusSelect
                      value={job.status}
                      disabled={statusUpdatingId === job.id && updateJobStatusMutation.isPending}
                      onChange={(nextStatus) => handleJobStatusChange(job, nextStatus)}
                    />
                  </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <StatusCard
                    label="Scheduled"
                    value={formatDateRange(job.scheduledStart, job.scheduledEnd) ?? "Pending"}
                  />
                  <StatusCard label="Actual" value={formatDateRange(job.actualStart, job.actualEnd) ?? "Not started"} />
                  <StatusCard label="Estimate" value={job.estimate?.status ?? "Unknown"} />
                </div>
                {job.notes && (
                  <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{job.notes}</p>
                )}
                <JobTasksSection
                  jobId={job.id}
                  templates={checklistTemplates}
                  templatesLoading={checklistTemplatesLoading}
                  templatesError={checklistTemplatesError ?? null}
                  applyingTemplateJobId={applyingTemplateJobId}
                  onApplyTemplate={(templateId, options) => handleApplyTemplate(job.id, templateId, options)}
                  onRemoveTemplate={(templateId) => handleRemoveTemplate(job.id, templateId)}
                  onTemplateDetected={handleTemplateResolved}
                  teamMembers={teamMembers}
                  teamMembersLoading={teamMembersLoading}
                  teamMembersError={teamMembersError?.message ?? null}
                  onCreateTask={(payload) => {
                    setTaskError(null);
                    createTaskMutation.mutate(payload);
                  }}
                  onUpdateTask={(payload) => updateTaskMutation.mutate(payload)}
                  onDeleteTask={(payload) => deleteTaskMutation.mutate(payload)}
                  creating={creatingForJob === job.id && createTaskMutation.isPending}
                  openCreateTask={() => {
                    setCreatingForJob(job.id);
                    setTaskError(null);
                    setNewTaskTitle("");
                    setNewTaskAssigneeId("");
                    setNewTaskDueDate("");
                  }}
                  closeCreateTask={() => {
                    setCreatingForJob(null);
                    setNewTaskTitle("");
                    setNewTaskAssigneeId("");
                    setNewTaskDueDate("");
                  }}
                  creatingForJob={creatingForJob}
                  newTaskTitle={newTaskTitle}
                  onNewTaskTitleChange={setNewTaskTitle}
                  newTaskAssigneeId={newTaskAssigneeId}
                  onNewTaskAssigneeChange={setNewTaskAssigneeId}
                  newTaskDueDate={newTaskDueDate}
                  onNewTaskDueDateChange={setNewTaskDueDate}
                  taskError={taskError}
                />
              </article>
            );
          })
          ) : (
            <div className="rounded-3xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No jobs in this status yet. Adjust the filters to see other assignments.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">{label}</span>
      <div>{value}</div>
    </div>
  );
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return undefined;
  const startText = start ? formatDate(start) : "TBD";
  const endText = end ? formatDate(end) : "TBD";
  return `${startText} → ${endText}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(iso));
}

function JobStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: JobStatus;
  disabled: boolean;
  onChange: (status: JobStatus) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as JobStatus)}
          className="appearance-none rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none pr-8"
          disabled={disabled}
        >
          {JOB_STATUS_OPTIONS.map(({ value: optionValue, label }) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </select>
        {disabled && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-primary" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function JobStatusFilters({
  options,
  counts,
  active,
  onChange,
}: {
  options: Array<{ value: JobFilter; label: string }>;
  counts: Record<JobFilter, number>;
  active: JobFilter;
  onChange: (value: JobFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-border/70 bg-surface/90 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">Filter</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = active === option.value;
          const count = counts[option.value] ?? 0;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold transition ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
              }`}
            >
              <span>{option.label}</span>
              <span
                className={`inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-[11px] ${
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted/80 text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorkPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-28 rounded-3xl border border-border/60 bg-muted/30 shadow-sm shadow-primary/10 animate-pulse" />
      <div className="h-32 rounded-3xl border border-border/50 bg-muted/20 shadow-sm shadow-primary/5 animate-pulse" />
    </div>
  );
}

function JobTasksSection(props: {
  jobId: string;
  teamMembers: TeamMember[];
  teamMembersLoading: boolean;
  teamMembersError: string | null;
  templates: ChecklistTemplate[];
  templatesLoading: boolean;
  templatesError: Error | null | undefined;
  applyingTemplateJobId: string | null;
  onApplyTemplate: (
    templateId: string,
    options?: {
      replaceTemplateId?: string;
    },
  ) => Promise<boolean>;
  onRemoveTemplate: (templateId: string) => Promise<boolean>;
  onTemplateDetected: (jobId: string, template: ChecklistTemplate | null) => void;
  onCreateTask: (input: CreateTaskInput) => void;
  onUpdateTask: (input: UpdateTaskInput) => void;
  onDeleteTask: (input: { jobId: string; taskId: string }) => void;
  creating: boolean;
  openCreateTask: () => void;
  closeCreateTask: () => void;
  creatingForJob: string | null;
  newTaskTitle: string;
  onNewTaskTitleChange: (value: string) => void;
  newTaskAssigneeId: string;
  onNewTaskAssigneeChange: (value: string) => void;
  newTaskDueDate: string;
  onNewTaskDueDateChange: (value: string) => void;
  taskError: string | null;
}) {
  const { toast: taskToast } = useToast();

  const {
    jobId,
    teamMembers,
    teamMembersLoading,
    teamMembersError,
    templates,
    templatesLoading,
    templatesError,
    applyingTemplateJobId,
    onApplyTemplate,
    onRemoveTemplate,
    onTemplateDetected,
    onCreateTask,
    onUpdateTask,
    onDeleteTask,
    creating,
    openCreateTask,
    closeCreateTask,
    creatingForJob,
    newTaskTitle,
    onNewTaskTitleChange,
    newTaskAssigneeId,
    onNewTaskAssigneeChange,
    newTaskDueDate,
    onNewTaskDueDateChange,
    taskError,
  } = props;

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showActivityFeed, setShowActivityFeed] = useState(false);

  const {
    data: jobActivityEntries,
    isLoading: jobActivityLoading,
    error: jobActivityError,
    refetch: refetchJobActivity,
  } = useJobActivity(showActivityFeed ? jobId : null, showActivityFeed);

  useEffect(() => {
    setSelectedTemplateId("");
  }, [jobId]);

  const { data: tasks, isLoading, error } = useQuery<TaskSummary[], Error>({
    queryKey: ["jobs", jobId, "tasks"],
    queryFn: () => fetchTasks(jobId),
  });

  const taskList = tasks ?? [];

  const appliedTemplateId = useMemo(() => {
    const jobTaskWithTemplate = taskList.find((task) => task.checklistTemplateId);
    return jobTaskWithTemplate?.checklistTemplateId ?? null;
  }, [taskList]);

  const appliedTemplate = appliedTemplateId
    ? templates.find((template) => template.id === appliedTemplateId)
    : undefined;

  useEffect(() => {
    onTemplateDetected(jobId, appliedTemplate ?? null);
  }, [appliedTemplate, jobId, onTemplateDetected]);

  const pendingTasks = useMemo(
    () => taskList.filter((task) => task.status !== "COMPLETE"),
    [taskList],
  );
  const completedTasks = useMemo(
    () => taskList.filter((task) => task.status === "COMPLETE"),
    [taskList],
  );

  const handleStatusToggle = (task: TaskSummary) => {
    onUpdateTask({
      jobId,
      taskId: task.id,
      updates: {
        status: task.status === "COMPLETE" ? "IN_PROGRESS" : "COMPLETE",
      },
    });
  };

  const handleAssigneeChange = (task: TaskSummary, assigneeId?: string) => {
    onUpdateTask({
      jobId,
      taskId: task.id,
      updates: {
        assigneeId: assigneeId ?? null,
      },
    });
  };

  const handleDueDateChange = (task: TaskSummary, dueAt: string | null) => {
    onUpdateTask({
      jobId,
      taskId: task.id,
      updates: {
        dueAt,
      },
    });
  };

  return (
    <div className="mt-6 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide">
        <span>Tasks</span>
        <div className="flex flex-wrap items-center gap-2">
          {appliedTemplate && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ClipboardCheck className="h-3 w-3 text-primary" aria-hidden="true" />
              <span>{appliedTemplate.name}</span>
              <button
                type="button"
                onClick={async () => {
                  const confirmed = window.confirm(
                    "Remove the current checklist? All template tasks for this job will be deleted.",
                  );
                  if (!confirmed) {
                    return;
                  }
                  const removed = await onRemoveTemplate(appliedTemplate.id);
                  if (removed) {
                    setSelectedTemplateId("");
                  }
                }}
                disabled={applyingTemplateJobId === jobId}
                className="rounded-full border border-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent transition hover:text-accent/80 disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          )}
          {templatesError && (
            <span className="text-[10px] text-accent">{templatesError.message}</span>
          )}
          {templatesLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : templates.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="min-w-[150px] rounded-full border border-border bg-background px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Apply template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedTemplateId) {
                    return;
                  }
                  if (appliedTemplateId && selectedTemplateId === appliedTemplateId) {
                    taskToast({
                      variant: "destructive",
                      title: "Template already applied",
                      description: "Choose a different template to replace the existing checklist.",
                    });
                    return;
                  }

                  const templateToApply = templates.find((template) => template.id === selectedTemplateId);
                  let replaceTemplateId: string | undefined;

                  if (appliedTemplate && selectedTemplateId !== appliedTemplate.id) {
                    const confirmed = window.confirm(
                      `Replace "${appliedTemplate.name}" with "${templateToApply?.name ?? "selected template"}"? Existing template tasks will be removed.`,
                    );

                    if (!confirmed) {
                      return;
                    }

                    replaceTemplateId = appliedTemplate.id;
                  }

                  const applied = await onApplyTemplate(
                    selectedTemplateId,
                    replaceTemplateId ? { replaceTemplateId } : undefined,
                  );

                  if (applied) {
                    setSelectedTemplateId("");
                  }
                }}
                disabled={
                  !selectedTemplateId ||
                  applyingTemplateJobId === jobId ||
                  templatesLoading ||
                  (!!appliedTemplateId && selectedTemplateId === appliedTemplateId)
                }
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
              >
                {applyingTemplateJobId === jobId ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
                )}
                Apply
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const next = !showActivityFeed;
              setShowActivityFeed(next);
              if (next) {
                void refetchJobActivity();
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <History className="h-3 w-3" aria-hidden="true" />
            {showActivityFeed ? "Hide activity" : "View activity"}
          </button>
          <button
            type="button"
            onClick={openCreateTask}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            Add task
          </button>
        </div>
      </div>

      {teamMembersError && (
        <div className="mb-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
          {teamMembersError}
        </div>
      )}

      {error && <div className="text-xs text-accent">{error.message}</div>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Loading tasks...
        </div>
      ) : taskList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No tasks scheduled yet. Add the first checklist item for this job.
        </div>
      ) : (
        <div className="space-y-3">
          {pendingTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">In progress</p>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    teamMembers={teamMembers}
                    teamMembersLoading={teamMembersLoading}
                    onToggleStatus={() => handleStatusToggle(task)}
                    onAssignChange={(assigneeId) => handleAssigneeChange(task, assigneeId)}
                    onDueDateChange={(dueAt) => handleDueDateChange(task, dueAt)}
                    onDelete={() => onDeleteTask({ jobId, taskId: task.id })}
                  />
                ))}
              </div>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Completed</p>
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    teamMembers={teamMembers}
                    teamMembersLoading={teamMembersLoading}
                    onToggleStatus={() => handleStatusToggle(task)}
                    onAssignChange={(assigneeId) => handleAssigneeChange(task, assigneeId)}
                    onDueDateChange={(dueAt) => handleDueDateChange(task, dueAt)}
                    onDelete={() => onDeleteTask({ jobId, taskId: task.id })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showActivityFeed && (
        <JobActivityStream
          entries={jobActivityEntries ?? []}
          loading={jobActivityLoading}
          error={jobActivityError?.message ?? null}
        />
      )}

      {creatingForJob === jobId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!newTaskTitle.trim()) {
              onNewTaskTitleChange("");
              setTimeout(() => onNewTaskTitleChange(""), 0);
              return;
            }
            onCreateTask({
              jobId,
              title: newTaskTitle.trim(),
              assigneeId: newTaskAssigneeId ? newTaskAssigneeId : undefined,
              dueAt: newTaskDueDate ? toIsoDateFromInput(newTaskDueDate) : undefined,
            });
          }}
          className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground"
        >
          <input
            value={newTaskTitle}
            onChange={(event) => onNewTaskTitleChange(event.target.value)}
            placeholder="Task title"
            className="flex-1 min-w-[140px] rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            autoFocus
          />
          <select
            value={newTaskAssigneeId}
            onChange={(event) => onNewTaskAssigneeChange(event.target.value)}
            className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            disabled={teamMembersLoading}
          >
            <option value="">Unassigned</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {formatTeamMemberLabel(member)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newTaskDueDate}
            onChange={(event) => onNewTaskDueDateChange(event.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            disabled={creating}
          >
            {creating && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              onNewTaskTitleChange("");
              onNewTaskAssigneeChange("");
              onNewTaskDueDateChange("");
              closeCreateTask();
            }}
            className="rounded-full border border-border px-3 py-1 font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            Cancel
          </button>
          {taskError && <span className="text-xs text-accent">{taskError}</span>}
        </form>
      )}
    </div>
  );
}

function TaskRow({
  task,
  teamMembers,
  teamMembersLoading,
  onToggleStatus,
  onAssignChange,
  onDueDateChange,
  onDelete,
}: {
  task: TaskSummary;
  teamMembers: TeamMember[];
  teamMembersLoading: boolean;
  onToggleStatus: () => void;
  onAssignChange: (assigneeId?: string) => void;
  onDueDateChange: (dueAt: string | null) => void;
  onDelete: () => void;
}) {
  const isComplete = task.status === "COMPLETE";
  const assigneeLabel = task.assignee?.name ?? task.assignee?.email ?? "Unassigned";
  const dueInputValue = toDateInputValue(task.dueAt);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs text-muted-foreground">
      <div className="flex min-w-[180px] flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onToggleStatus}
          className="rounded-full border border-border p-1 text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          {isComplete ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
        </button>
        <div>
          <p className={`font-medium ${isComplete ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {task.title}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">
            {assigneeLabel}
            {task.dueAt ? ` - due ${formatDate(task.dueAt)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={task.assignee?.id ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onAssignChange(value ? value : undefined);
          }}
          className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none"
          disabled={teamMembersLoading}
        >
          <option value="">Unassigned</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {formatTeamMemberLabel(member)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueInputValue}
          onChange={(event) => {
            const value = event.target.value;
            onDueDateChange(value ? toIsoDateFromInput(value) : null);
          }}
          className="rounded border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-border px-2 py-1 text-muted-foreground transition hover:border-accent hover:text-accent"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toIsoDateFromInput(value: string): string {
  return new Date(`${value}T00:00:00Z`).toISOString();
}

function JobActivityStream({
  entries,
  loading,
  error,
}: {
  entries: JobActivityEntry[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground/80">Recent activity</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {error ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent-foreground">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
              <p className="font-semibold text-foreground">{describeJobActivity(entry)}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                {formatActor(entry)} • {formatRelativeTimeFromNow(entry.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTeamMemberLabel(member: TeamMember): string {
  const base = member.name && member.name.trim().length > 0 ? member.name : member.email;
  const primaryRole = member.roles.find((role) => role?.name)?.name;
  return primaryRole ? `${base} (${primaryRole})` : base;
}

function toTaskAssignee(member?: TeamMember): TaskSummary["assignee"] | undefined {
  if (!member) return undefined;
  return {
    id: member.id,
    name: member.name ?? undefined,
    email: member.email,
  };
}

function describeJobActivity(entry: JobActivityEntry): string {
  const meta = toRecord(entry.meta);
  switch (entry.action) {
    case "job.checklist_template_applied":
      return `Checklist "${meta?.templateName ?? fallbackTemplateLabel(meta)}" applied`;
    case "job.checklist_template_removed":
      return `Checklist "${meta?.templateName ?? fallbackTemplateLabel(meta)}" removed`;
    default:
      return entry.action
        .split(/[._]/)
        .filter((segment) => segment.length > 0)
        .map(capitalize)
        .join(" ");
  }
}

function fallbackTemplateLabel(meta: Record<string, unknown> | null): string {
  if (!meta) return "Template";
  const id = typeof meta.templateId === "string" ? meta.templateId : null;
  return id ? `(${id})` : "Template";
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatActor(entry: JobActivityEntry): string {
  return entry.actor?.name ?? entry.actor?.email ?? "System";
}

function formatRelativeTimeFromNow(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(new Date());
  }
  const now = Date.now();
  const diff = target - now;
  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(seconds) < 60) {
    return rtf.format(Math.trunc(seconds), "second");
  }
  if (Math.abs(minutes) < 60) {
    return rtf.format(Math.trunc(minutes), "minute");
  }
  if (Math.abs(hours) < 24) {
    return rtf.format(Math.trunc(hours), "hour");
  }
  if (Math.abs(days) < 7) {
    return rtf.format(Math.trunc(days), "day");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(target));
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
