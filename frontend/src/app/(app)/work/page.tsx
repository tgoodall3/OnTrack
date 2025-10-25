"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, MapPin, Timer, Plus, CheckCircle2, Circle } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

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

export default function WorkPage() {
  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery<JobSummary[], Error>({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
  });

    const { toast } = useToast();
const queryClient = useQueryClient();
  const [creatingForJob, setCreatingForJob] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);

  type TaskQueryKey = ["jobs", string, "tasks"];

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
      const optimisticTask: TaskSummary = {
        id: optimisticId,
        title: input.title,
        status: "PENDING",
        dueAt: input.dueAt ?? null,
        checklistTemplateId: undefined,
        assignee: undefined,
        metadata: undefined,
      };
      queryClient.setQueryData<TaskSummary[]>(key, [...previousTasks, optimisticTask]);
      return { previousTasks, key, optimisticId };
    },
    onError: (mutationError, input, context) => {
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
    onSuccess: (task, input, context) => {
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
      queryClient.setQueryData<TaskSummary[]>(key, previousTasks.map((task) =>
        task.id === input.taskId
          ? {
              ...task,
              ...input.updates,
              status: (input.updates.status as TaskStatus | undefined) ?? task.status,
              dueAt: input.updates.dueAt ?? task.dueAt,
            }
          : task,
      ));
      return { previousTasks, key };
    },
    onError: (mutationError, input, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.key, context.previousTasks);
      }
      toast({
        variant: "destructive",
        title: "Failed to update task",
        description: mutationError.message,
      });
    },
    onSuccess: (task, input, context) => {
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
    onError: (mutationError, input, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.key, context.previousTasks);
      }
      toast({
        variant: "destructive",
        title: "Failed to remove task",
        description: mutationError.message,
      });
    },
    onSuccess: (_result, variables) => {
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

  const jobs = data ?? [];
  const hasJobs = jobs.length > 0;
  const showLoading = isLoading || isFetching;
  const errorMessage = error?.message ?? null;

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
          Loading jobs…
        </div>
      ) : !hasJobs ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No jobs yet. Once estimates are approved and scheduled, they will appear here.
        </div>
      ) : (
        <section className="space-y-4">
          {jobs.map((job) => (
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
                    {job.estimate?.number ?? "Unscheduled estimate"} · {job.lead?.stage.replace("_", " ") ?? "Lead"}
                  </p>
                  {job.property && (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      {job.property.address}
                    </p>
                  )}
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {job.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatusCard
                  label="Scheduled"
                  value={formatDateRange(job.scheduledStart, job.scheduledEnd) ?? "Pending"}
                />
                <StatusCard label="Actual" value={formatDateRange(job.actualStart, job.actualEnd) ?? "Not started"} />
                <StatusCard label="Estimate" value={job.estimate?.status ?? "—"} />
              </div>
              {job.notes && (
                <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{job.notes}</p>
              )}
              <JobTasksSection
                jobId={job.id}
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
                }}
                closeCreateTask={() => {
                  setCreatingForJob(null);
                  setNewTaskTitle("");
                }}
                creatingForJob={creatingForJob}
                newTaskTitle={newTaskTitle}
                onNewTaskTitleChange={setNewTaskTitle}
                taskError={taskError}
              />
            </article>
          ))}
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

function JobTasksSection(props: {
  jobId: string;
  onCreateTask: (input: CreateTaskInput) => void;
  onUpdateTask: (input: UpdateTaskInput) => void;
  onDeleteTask: (input: { jobId: string; taskId: string }) => void;
  creating: boolean;
  openCreateTask: () => void;
  closeCreateTask: () => void;
  creatingForJob: string | null;
  newTaskTitle: string;
  onNewTaskTitleChange: (value: string) => void;
  taskError: string | null;
}) {
  const { jobId } = props;
  const { data: tasks, isLoading, error } = useQuery<TaskSummary[], Error>({
    queryKey: ["jobs", jobId, "tasks"],
    queryFn: () => fetchTasks(jobId),
  });

  const taskList = tasks ?? [];

  const pendingTasks = useMemo(
    () => taskList.filter((task) => task.status !== "COMPLETE"),
    [taskList],
  );
  const completedTasks = useMemo(
    () => taskList.filter((task) => task.status === "COMPLETE"),
    [taskList],
  );

  const handleStatusToggle = (task: TaskSummary) => {
    props.onUpdateTask({
      jobId,
      taskId: task.id,
      updates: {
        status: task.status === "COMPLETE" ? "IN_PROGRESS" : "COMPLETE",
      },
    });
  };

  return (
    <div className="mt-6 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
        <span>Tasks</span>
        <button
          type="button"
          onClick={props.openCreateTask}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-3 w-3" />
          Add task
        </button>
      </div>

      {error && <div className="text-xs text-accent">{error.message}</div>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Loading tasks…
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
                    jobId={jobId}
                    task={task}
                    onToggleStatus={() => handleStatusToggle(task)}
                    onDelete={() => props.onDeleteTask({ jobId, taskId: task.id })}
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
                    jobId={jobId}
                    task={task}
                    onToggleStatus={() => handleStatusToggle(task)}
                    onDelete={() => props.onDeleteTask({ jobId, taskId: task.id })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {props.creatingForJob === jobId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!props.newTaskTitle.trim()) {
              props.onNewTaskTitleChange("");
              setTimeout(() => props.onNewTaskTitleChange(""), 0);
              return;
            }
            props.onCreateTask({
              jobId,
              title: props.newTaskTitle.trim(),
            });
          }}
          className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground"
        >
          <input
            value={props.newTaskTitle}
            onChange={(event) => props.onNewTaskTitleChange(event.target.value)}
            placeholder="Task title"
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            disabled={props.creating}
          >
            {props.creating && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            Save
          </button>
          <button
            type="button"
            onClick={props.closeCreateTask}
            className="rounded-full border border-border px-3 py-1 font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            Cancel
          </button>
          {props.taskError && <span className="text-xs text-accent">{props.taskError}</span>}
        </form>
      )}
    </div>
  );
}

function TaskRow({
  jobId,
  task,
  onToggleStatus,
  onDelete,
}: {
  jobId: string;
  task: TaskSummary;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const isComplete = task.status === "COMPLETE";

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
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
            {task.assignee?.name ?? "Unassigned"}
            {task.dueAt ? ` · due ${formatDate(task.dueAt)}` : ""}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-full border border-border px-2 py-1 text-muted-foreground transition hover:border-accent hover:text-accent"
      >
        Remove
      </button>
    </div>
  );
}
