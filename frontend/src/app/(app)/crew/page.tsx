"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Circle, ClipboardCheck, Loader2, MapPin, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { JobStatus, JobSummary, TaskStatus, TaskSummary, CrewTaskSummary } from "@/lib/types/jobs";
import { useTeamMembers, TeamMember } from "@/hooks/use-team-members";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

async function fetchCrewJobs(assigneeId?: string): Promise<JobSummary[]> {
  const url = new URL(`${API_BASE_URL}/jobs`);
  if (assigneeId) {
    url.searchParams.set("assigneeId", assigneeId);
  }
  url.searchParams.set("take", "50");

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load jobs (${response.status})`);
  }

  return response.json();
}

async function updateTaskStatusRequest(jobId: string, taskId: string, status: TaskStatus): Promise<TaskSummary> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_HEADER,
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => null);
    throw new Error(message || `Failed to update task (${response.status})`);
  }

  return response.json();
}

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  CANCELED: "Canceled",
};

export default function CrewMyDayPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: crewMembers, isLoading: teamLoading, error: teamError } = useTeamMembers();
  const activeCrewMembers = useMemo(() => (crewMembers ?? []).filter((member) => member.active), [crewMembers]);
  const [selectedCrewId, setSelectedCrewId] = useState<string | "all">("all");
  const [selectionHydrated, setSelectionHydrated] = useState(false);

  useEffect(() => {
    if (!selectionHydrated && typeof window !== "undefined") {
      const stored = window.localStorage.getItem("ontrack:selectedCrewId");
      if (stored && stored !== "all") {
        const found = activeCrewMembers.some((member) => member.id === stored);
        if (found) {
          setSelectedCrewId(stored);
          setSelectionHydrated(true);
          return;
        }
      } else if (stored === "all") {
        setSelectedCrewId("all");
        setSelectionHydrated(true);
        return;
      }
      setSelectionHydrated(true);
    }
  }, [activeCrewMembers, selectionHydrated]);

  useEffect(() => {
    if (
      selectionHydrated &&
      selectedCrewId === "all" &&
      activeCrewMembers.length === 1
    ) {
      setSelectedCrewId(activeCrewMembers[0].id);
    }
  }, [activeCrewMembers, selectionHydrated, selectedCrewId]);

  useEffect(() => {
    if (
      selectionHydrated &&
      selectedCrewId !== "all"
    ) {
      const stillExists = activeCrewMembers.some((member) => member.id === selectedCrewId);
      if (!stillExists) {
        setSelectedCrewId("all");
      }
    }
  }, [activeCrewMembers, selectionHydrated, selectedCrewId]);

  useEffect(() => {
    if (!selectionHydrated || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("ontrack:selectedCrewId", selectedCrewId);
  }, [selectionHydrated, selectedCrewId]);

  const jobsQueryKey = useMemo(() => ["crew", "jobs", selectedCrewId] as const, [selectedCrewId]);

  const {
    data: jobs,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<JobSummary[], Error>({
    queryKey: jobsQueryKey,
    queryFn: () => fetchCrewJobs(selectedCrewId === "all" ? undefined : selectedCrewId),
    enabled: selectionHydrated,
  });

  const isInitialLoading = !selectionHydrated || isLoading;

  const updateTaskStatusMutation = useMutation<
    TaskSummary,
    Error,
    { jobId: string; task: TaskSummary },
    { previousJobs?: JobSummary[] }
  >({
    mutationFn: ({ jobId, task }) => {
      const nextStatus: TaskStatus = task.status === "COMPLETE" ? "IN_PROGRESS" : "COMPLETE";
      return updateTaskStatusRequest(jobId, task.id, nextStatus);
    },
    onMutate: async ({ jobId, task }) => {
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });
      const previousJobs = queryClient.getQueryData<JobSummary[]>(jobsQueryKey);
      const nextStatus: TaskStatus = task.status === "COMPLETE" ? "IN_PROGRESS" : "COMPLETE";

      if (previousJobs) {
        const optimisticJobs = previousJobs.map((job) => {
          if (job.id !== jobId) {
            return job;
          }
          return {
            ...job,
            tasks: job.tasks?.map((existing) =>
              existing.id === task.id ? { ...existing, status: nextStatus } : existing,
            ),
          };
        });
        queryClient.setQueryData(jobsQueryKey, optimisticJobs);
      }

      return { previousJobs };
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previousJobs) {
        queryClient.setQueryData(jobsQueryKey, context.previousJobs);
      }
      toast({
        variant: "destructive",
        title: "Unable to update task",
        description: mutationError.message,
      });
    },
    onSuccess: (updatedTask, variables) => {
      queryClient.setQueryData<JobSummary[]>(jobsQueryKey, (current) => {
        if (!current) return current;
        return current.map((job) => {
          if (job.id !== variables.jobId) {
            return job;
          }
          return {
            ...job,
            tasks: job.tasks?.map((existing) =>
              existing.id === updatedTask.id ? { ...existing, status: updatedTask.status } : existing,
            ),
          };
        });
      });

      toast({
        variant: updatedTask.status === "COMPLETE" ? "success" : "default",
        title: updatedTask.status === "COMPLETE" ? "Task completed" : "Task reopened",
        description:
          updatedTask.status === "COMPLETE"
            ? "Nice work. Stay on pace for the rest of the checklist."
            : "Marked back in progress so you can wrap it up.",
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });

  const today = useMemo(() => new Date(), []);
  const allJobs = jobs ?? [];
  const todaysJobs = useMemo(() => {
    if (selectedCrewId === "all") {
      return allJobs.filter((job) => isJobToday(job, today));
    }

    return allJobs
      .filter((job) => isJobToday(job, today))
      .map((job) => ({
        ...job,
        tasks: (job.tasks ?? []).filter((task) => task.assignee?.id === selectedCrewId),
      }))
      .filter((job) => (job.tasks?.length ?? 0) > 0);
  }, [allJobs, today, selectedCrewId]);

  const todaysTasks = todaysJobs.flatMap((job) => job.tasks ?? []);
  const completedTaskCount = todaysTasks.filter((task) => task.status === "COMPLETE").length;
  const emptyStateMessage =
    selectedCrewId === "all"
      ? "No jobs scheduled for today. Check back later or refresh to load new assignments."
      : "No jobs assigned to you today. Enjoy the downtime or check in with your coordinator.";

  const personalTasks = useMemo<CrewTaskSummary[]>(() => {
    if (selectedCrewId === "all") {
      return [];
    }

    return allJobs
      .flatMap((job) =>
        (job.tasks ?? [])
          .filter((task) => task.assignee?.id === selectedCrewId)
          .map((task) => ({
            ...task,
            jobId: job.id,
            jobLabel:
              job.lead?.contactName ??
              job.property?.address ??
              job.estimate?.number ??
              "Unassigned job",
          })),
      )
      .sort((a, b) => {
        const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
  }, [allJobs, selectedCrewId]);

  return (
    <div className="page-stack w-full max-w-3xl mx-auto">
      <header className="section-card shadow-md shadow-primary/10">
        <div className="stack-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="space-y-2 text-muted-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </p>
            <h1 className="text-2xl font-semibold text-foreground">Crew My Day</h1>
            <p className="text-sm">
              Review your jobs, checklists, and updates. Mark tasks complete as you work through the day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
            disabled={isRefetching || !selectionHydrated}
          >
            {isRefetching ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Crew member
          </label>
          {teamLoading ? (
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Loading crew...
            </div>
          ) : teamError ? (
            <span className="text-xs text-accent">Unable to load crew: {teamError.message}</span>
          ) : (
            <select
              value={selectedCrewId}
              onChange={(event) => setSelectedCrewId(event.target.value as typeof selectedCrewId)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All crew</option>
              {activeCrewMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {formatCrewMemberLabel(member)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <CrewSummaryCard label="Jobs today" value={todaysJobs.length} />
          <CrewSummaryCard label="Tasks completed" value={completedTaskCount} />
          <CrewSummaryCard label="Open checklist items" value={todaysTasks.length - completedTaskCount} />
        </div>
      </header>

      {error ? (
        <div className="rounded-3xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm text-accent-foreground">
          {error.message}
        </div>
      ) : isInitialLoading ? (
        <div className="space-y-3">
          <div className="h-24 rounded-3xl border border-border/60 bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-3xl border border-border/60 bg-muted/30 animate-pulse" />
        </div>
      ) : todaysJobs.length === 0 ? (
        selectedCrewId !== "all" && personalTasks.length > 0 ? (
          <CrewTaskFocusCard
            tasks={personalTasks}
            onToggleTask={(task) => updateTaskStatusMutation.mutate({ jobId: task.jobId, task })}
            isUpdating={(taskId) =>
              updateTaskStatusMutation.isPending &&
              updateTaskStatusMutation.variables?.task.id === taskId
            }
          />
        ) : (
          <div className="rounded-3xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyStateMessage}
          </div>
        )
      ) : (
        <section className="space-y-4">
          {selectedCrewId !== "all" && personalTasks.length > 0 && (
            <CrewTaskFocusCard
              tasks={personalTasks}
              onToggleTask={(task) => updateTaskStatusMutation.mutate({ jobId: task.jobId, task })}
              isUpdating={(taskId) =>
                updateTaskStatusMutation.isPending &&
                updateTaskStatusMutation.variables?.task.id === taskId
              }
            />
          )}

          {todaysJobs.map((job) => (
            <CrewJobCard
              key={job.id}
              job={job}
              showingAssignedOnly={selectedCrewId !== "all"}
              onToggleTask={(task) => updateTaskStatusMutation.mutate({ jobId: job.id, task })}
              isUpdating={(taskId) =>
                updateTaskStatusMutation.isPending &&
                updateTaskStatusMutation.variables?.jobId === job.id &&
                updateTaskStatusMutation.variables?.task.id === taskId
              }
            />
          ))}
        </section>
      )}
    </div> )};

function CrewSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CrewTaskFocusCard({
  tasks,
  onToggleTask,
  isUpdating,
}: {
  tasks: CrewTaskSummary[];
  onToggleTask: (task: CrewTaskSummary) => void;
  isUpdating: (taskId: string) => boolean;
}) {
  return (
    <article className="space-y-3 rounded-3xl border border-primary/40 bg-primary/5 p-5 shadow-sm shadow-primary/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Assigned to you</p>
          <p className="text-sm text-muted-foreground">
            Tasks assigned to you across jobs. Tackle them in order and mark complete as you go.
          </p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {tasks.map((task) => {
          const dueState = describeTaskDue(task);
          const isComplete = task.status === "COMPLETE";
          return (
            <li
              key={task.id}
              className="flex items-start justify-between gap-2 rounded-2xl border border-primary/30 bg-background px-3 py-2"
            >
              <div className="flex flex-1 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onToggleTask(task)}
                  className="inline-flex items-center gap-2 text-left font-medium text-foreground transition hover:text-primary disabled:cursor-wait"
                  disabled={isUpdating(task.id)}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className={isComplete ? "line-through text-muted-foreground/70" : ""}>{task.title}</span>
                </button>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                  <span>{task.jobLabel}</span>
                  {dueState ? (
                    <span
                      className={`font-semibold uppercase tracking-wide ${
                        dueState.state === "overdue"
                          ? "text-accent"
                          : dueState.state === "soon"
                            ? "text-primary"
                          : "text-muted-foreground/70"
                      }`}
                    >
                      {dueState.label}
                    </span>
                  ) : null}
                  <Link
                    href={`/work?jobId=${task.jobId}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    View job
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function CrewJobCard({
  job,
  showingAssignedOnly,
  onToggleTask,
  isUpdating,
}: {
  job: JobSummary;
  showingAssignedOnly: boolean;
  onToggleTask: (task: TaskSummary) => void;
  isUpdating: (taskId: string) => boolean;
}) {
  const scheduledWindow = formatScheduledWindow(job.scheduledStart, job.scheduledEnd);
  const tasks = job.tasks ?? [];

  return (
    <article className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm shadow-primary/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">
            {job.lead?.contactName ?? job.property?.address ?? "Unassigned job"}
          </p>
          <p className="text-xs text-muted-foreground">
            {JOB_STATUS_LABELS[job.status]}
            {scheduledWindow ? ` • ${scheduledWindow}` : ""}
          </p>
          {job.property?.address && (
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
              {job.property.address}
            </p>
          )}
        </div>
        <Link
          href={`/work?jobId=${job.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          View job
        </Link>
      </div>

      {job.notes && (
        <p className="rounded-2xl bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{job.notes}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Checklist</p>
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
            {showingAssignedOnly ? "No tasks assigned to you on this job." : "No tasks assigned yet."}
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const isComplete = task.status === "COMPLETE";
              const dueState = describeTaskDue(task);

              return (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                >
                  <div className="flex flex-1 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleTask(task)}
                      className="inline-flex items-center gap-2 text-left text-sm font-medium text-foreground transition hover:text-primary disabled:cursor-wait"
                      disabled={isUpdating(task.id)}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className={isComplete ? "line-through text-muted-foreground/70" : ""}>{task.title}</span>
                    </button>
                    {dueState ? (
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wide ${
                          dueState.state === "overdue"
                            ? "text-accent"
                            : dueState.state === "soon"
                              ? "text-primary"
                              : "text-muted-foreground/70"
                        }`}
                      >
                        {dueState.label}
                      </span>
                    ) : null}
                  </div>
                  {isUpdating(task.id) && <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
        <ClipboardCheck className="h-3 w-3 text-primary" aria-hidden="true" />
        {tasks.filter((task) => task.status === "COMPLETE").length}/{tasks.length} complete
        {job.scheduledStart && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3 text-primary" aria-hidden="true" />
            {formatTime(job.scheduledStart)}
          </span>
        )}
      </div>
    </article>
  );
}

function formatScheduledWindow(start?: string | null, end?: string | null) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const startLabel = formatter.format(startDate);
  const endLabel = endDate ? formatter.format(endDate) : null;
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function describeTaskDue(task: TaskSummary) {
  if (!task.dueAt) {
    return null;
  }

  const due = new Date(task.dueAt).getTime();
  if (Number.isNaN(due)) {
    return null;
  }
  const now = Date.now();
  const diffMs = due - now;
  const absMinutes = Math.abs(diffMs) / (1000 * 60);

  const formatDistance = () => {
    if (absMinutes < 60) {
      const minutes = Math.round(absMinutes);
      return `${minutes} min${minutes === 1 ? "" : "s"}`;
    }
    const hours = Math.round(absMinutes / 60);
    if (hours < 24) {
      return `${hours} hr${hours === 1 ? "" : "s"}`;
    }
    const days = Math.round(absMinutes / (60 * 24));
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  if (diffMs < -5 * 60 * 1000) {
    return { state: "overdue" as const, label: `Overdue by ${formatDistance()}` };
  }

  if (diffMs <= 60 * 60 * 1000 && diffMs >= 0) {
    return { state: "soon" as const, label: `Due in ${formatDistance()}` };
  }

  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(due));
  return { state: "scheduled" as const, label: `Due at ${timeLabel}` };
}

function isJobToday(job: JobSummary, today: Date) {
  if (!job.scheduledStart) {
    return true;
  }
  const start = new Date(job.scheduledStart);
  return start.toDateString() === today.toDateString();
}

function formatCrewMemberLabel(member: TeamMember) {
  if (member.name && member.name.trim().length > 0) {
    return member.name;
  }
  return member.email;
}
