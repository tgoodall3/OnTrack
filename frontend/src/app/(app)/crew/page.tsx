"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  DollarSign,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Timer,
  XOctagon,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { JobStatus, JobSummary, TaskStatus, TaskSummary, CrewTaskSummary } from "@/lib/types/jobs";
import { useTeamMembers, TeamMember } from "@/hooks/use-team-members";
import {
  useApproveTimeEntry,
  useJobTimeEntries,
  useClockInTimeEntry,
  useClockOutTimeEntry,
  useRejectTimeEntry,
  isApprovableStatus,
  isRejectableStatus,
} from "@/hooks/use-time-entries";
import { TimeEntryStatus, TimeEntrySummary } from "@/lib/types/time-entries";
import {
  useJobMaterials,
  useCreateMaterial,
  useApproveMaterial,
  useRejectMaterial,
} from "@/hooks/use-materials";
import { MaterialApprovalStatus } from "@/lib/types/materials";

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
  const teamMembersById = useMemo(() => {
    const map: Record<string, TeamMember> = {};
    for (const member of crewMembers ?? []) {
      map[member.id] = member;
    }
    return map;
  }, [crewMembers]);
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

  const defaultActorId = useMemo(() => {
    if (selectedCrewId !== "all") {
      return selectedCrewId;
    }
    return activeCrewMembers[0]?.id;
  }, [selectedCrewId, activeCrewMembers]);

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
              teamMembersById={teamMembersById}
              defaultActorId={defaultActorId}
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
  teamMembersById,
  defaultActorId,
}: {
  job: JobSummary;
  showingAssignedOnly: boolean;
  onToggleTask: (task: TaskSummary) => void;
  isUpdating: (taskId: string) => boolean;
  teamMembersById: Record<string, TeamMember>;
  defaultActorId?: string;
}) {
    const { toast } = useToast();
    const [materialDraft, setMaterialDraft] = useState({
      sku: "",
      costCode: "",
      quantity: "",
      unitCost: "",
      notes: "",
    });
    const [materialReviewNotes, setMaterialReviewNotes] = useState<Record<string, string>>({});
    const [materialRejectionReasons, setMaterialRejectionReasons] = useState<Record<string, string>>({});
    const materialsQuery = useJobMaterials(job.id);
    const materials = materialsQuery.data ?? [];
    const createMaterialMutation = useCreateMaterial(job.id);
    const approveMaterialMutation = useApproveMaterial(job.id);
    const rejectMaterialMutation = useRejectMaterial(job.id);
    const scheduledWindow = formatScheduledWindow(job.scheduledStart, job.scheduledEnd);
    const tasks = job.tasks ?? [];
    const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
    const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
    const timeEntriesQuery = useJobTimeEntries(job.id);
    const {
      data: timeEntries = [],
      isLoading: timeEntriesLoading,
      isRefetching: timeEntriesRefetching,
      error: timeEntriesError,
      refetch: refetchTimeEntries,
    } = timeEntriesQuery;
    const approveMutation = useApproveTimeEntry(job.id);
    const rejectMutation = useRejectTimeEntry(job.id);
    const clockInMutation = useClockInTimeEntry(job.id);
    const clockOutMutation = useClockOutTimeEntry(job.id);
    const activeEntryForActor = timeEntries.find(
      (entry) => entry.userId === defaultActorId && entry.status === "IN_PROGRESS",
    );
    const canClockIn = Boolean(defaultActorId) && !activeEntryForActor;
    const canClockOut = Boolean(activeEntryForActor);

    const handleApprove = (entryId: string) => {
      approveMutation.mutate(
        {
          jobId: job.id,
          entryId,
          note: approvalNotes[entryId]?.trim() ? approvalNotes[entryId] : undefined,
        },
        {
          onSuccess: () => {
            setApprovalNotes((current) => {
              const next = { ...current };
              delete next[entryId];
              return next;
            });
            toast({
              variant: "success",
              title: "Time entry approved",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to approve entry",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

    const handleReject = (entryId: string) => {
      const reason = (rejectionReasons[entryId] ?? "").trim();
      if (!reason) {
        toast({
          variant: "destructive",
          title: "Reason required",
          description: "Add a quick note so the crew knows what to fix.",
        });
        return;
      }

      rejectMutation.mutate(
        {
          jobId: job.id,
          entryId,
          reason,
          note: approvalNotes[entryId]?.trim() ? approvalNotes[entryId] : undefined,
        },
        {
          onSuccess: () => {
            setRejectionReasons((current) => {
              const next = { ...current };
              delete next[entryId];
              return next;
            });
            toast({
              variant: "success",
              title: "Sent back for adjustments",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to request changes",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

    const handleClockIn = () => {
      if (!defaultActorId) {
        toast({
          variant: "destructive",
          title: "Select crew member",
          description: "Pick a crew member so we know who is clocking in.",
        });
        return;
      }

      clockInMutation.mutate(
        {
          jobId: job.id,
          userId: defaultActorId,
        },
        {
          onSuccess: () => {
            toast({
              variant: "success",
              title: "Clocked in",
              description: "Timer started for this job.",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to clock in",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

    const handleClockOut = () => {
      if (!defaultActorId) {
        toast({
          variant: "destructive",
          title: "Select crew member",
          description: "Pick a crew member so we know who is clocking out.",
        });
        return;
      }

      const inProgressEntry = timeEntries.find(
        (entry) => entry.userId === defaultActorId && entry.status === "IN_PROGRESS",
      );

      if (!inProgressEntry) {
        toast({
          variant: "destructive",
          title: "No active timer",
          description: "Clock in first before ending a shift.",
        });
        return;
      }

      clockOutMutation.mutate(
        {
          jobId: job.id,
          entryId: inProgressEntry.id,
          userId: defaultActorId,
        },
        {
          onSuccess: () => {
            toast({
              variant: "success",
              title: "Clocked out",
              description: "Time entry submitted for review.",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to clock out",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

    const handleCreateMaterial = () => {
      if (!defaultActorId) {
        toast({
          variant: "destructive",
          title: "Select crew member",
          description: "Choose a crew member so the material can be attributed correctly.",
        });
        return;
      }

      const sku = materialDraft.sku.trim();
      if (!sku) {
        toast({
          variant: "destructive",
          title: "Material SKU required",
          description: "Add a SKU or description before saving the material.",
        });
        return;
      }

      const quantityValue = Number(materialDraft.quantity);
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        toast({
          variant: "destructive",
          title: "Quantity invalid",
          description: "Enter a positive quantity.",
        });
        return;
      }

      const unitCostValue = Number(materialDraft.unitCost);
      if (!Number.isFinite(unitCostValue) || unitCostValue < 0) {
        toast({
          variant: "destructive",
          title: "Unit cost invalid",
          description: "Enter a valid unit cost (0 or greater).",
        });
        return;
      }

      createMaterialMutation.mutate(
        {
          sku,
          costCode: materialDraft.costCode.trim() ? materialDraft.costCode.trim() : undefined,
          quantity: quantityValue,
          unitCost: unitCostValue,
          notes: materialDraft.notes.trim() ? materialDraft.notes.trim() : undefined,
          recordedById: defaultActorId,
        },
        {
          onSuccess: () => {
            setMaterialDraft({
              sku: "",
              costCode: "",
              quantity: "",
              unitCost: "",
              notes: "",
            });
            toast({
              variant: "success",
              title: "Material logged",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to save material",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

    const handleApproveMaterialEntry = (entryId: string) => {
      if (!defaultActorId) {
        toast({
          variant: "destructive",
          title: "Select supervisor",
          description: "Choose a team member to approve the material.",
        });
        return;
      }

      const note = (materialReviewNotes[entryId] ?? "").trim();
      approveMaterialMutation.mutate(
        {
          jobId: job.id,
          entryId,
          approverId: defaultActorId,
          note: note ? note : null,
        },
        {
          onSuccess: () => {
            setMaterialReviewNotes((current) => {
              const next = { ...current };
              delete next[entryId];
              return next;
            });
            toast({
              variant: "success",
              title: "Material approved",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to approve material",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

    const handleRejectMaterialEntry = (entryId: string) => {
      if (!defaultActorId) {
        toast({
          variant: "destructive",
          title: "Select supervisor",
          description: "Choose a team member to request changes.",
        });
        return;
      }

      const reason = (materialRejectionReasons[entryId] ?? "").trim();
      if (!reason) {
        toast({
          variant: "destructive",
          title: "Reason required",
          description: "Add a quick note so the crew knows what to adjust.",
        });
        return;
      }

      const note = (materialReviewNotes[entryId] ?? "").trim();
      rejectMaterialMutation.mutate(
        {
          jobId: job.id,
          entryId,
          approverId: defaultActorId,
          reason,
          note: note ? note : null,
        },
        {
          onSuccess: () => {
            setMaterialRejectionReasons((current) => {
              const next = { ...current };
              delete next[entryId];
              return next;
            });
            toast({
              variant: "success",
              title: "Sent back for changes",
            });
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Unable to request changes",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
    };

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

        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Time entries</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClockIn}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!canClockIn || clockInMutation.isPending}
              >
                {clockInMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Timer className="h-3 w-3 text-primary" aria-hidden="true" />
                )}
                Clock in
              </button>
              <button
                type="button"
                onClick={handleClockOut}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!canClockOut || clockOutMutation.isPending}
              >
                {clockOutMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Timer className="h-3 w-3 text-primary" aria-hidden="true" />
                )}
                Clock out
              </button>
              <button
                type="button"
                onClick={() => refetchTimeEntries()}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
                disabled={timeEntriesLoading || timeEntriesRefetching}
              >
                <RefreshCw
                  className={`h-3 w-3 ${timeEntriesRefetching ? "animate-spin text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                Refresh
              </button>
            </div>
          </div>

          {timeEntriesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              Loading time entries…
            </div>
          ) : timeEntriesError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Unable to load time entries. {timeEntriesError.message}
            </p>
          ) : timeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground/80">
              No time has been logged yet. Use the clock in button above to start tracking time.
            </p>
          ) : (
            <div className="space-y-3">
              {timeEntries.map((entry) => {
                const ownerName = formatTeamMemberName(entry.userId, teamMembersById);
                const submittedByName = entry.submittedById
                  ? formatTeamMemberName(entry.submittedById, teamMembersById)
                  : null;
                const approverName = entry.approverId
                  ? formatTeamMemberName(entry.approverId, teamMembersById)
                  : null;
                const durationLabel = formatDuration(entry.durationMinutes, entry.durationSeconds);
                const timeRange = formatTimeRange(entry.clockIn, entry.clockOut);
                const submittedLabel = entry.submittedAt ? formatRelativeTimestamp(entry.submittedAt) : null;
                const approvedLabel = entry.approvedAt ? formatRelativeTimestamp(entry.approvedAt) : null;
                const clockInLocation = formatLocation(entry.clockInLocation);
                const clockOutLocation = formatLocation(entry.clockOutLocation);
                const approvable = isApprovableStatus(entry.status);
                const rejectable = isRejectableStatus(entry.status);
                const approvingThisEntry =
                  approveMutation.isPending && approveMutation.variables?.entryId === entry.id;
                const rejectingThisEntry =
                  rejectMutation.isPending && rejectMutation.variables?.entryId === entry.id;

                return (
                  <div key={entry.id} className="space-y-3 rounded-xl border border-border/40 bg-background px-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/70">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${timeEntryStatusStyles[entry.status]}`}>
                          <span className="h-2 w-2 rounded-full bg-current opacity-70" aria-hidden="true" />
                          {timeEntryStatusLabels[entry.status]}
                        </span>
                        <span className="text-muted-foreground">{ownerName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80">
                        {timeRange ? (
                          <span className="inline-flex items-center gap-1">
                            <Timer className="h-3 w-3 text-primary" aria-hidden="true" />
                            {timeRange}
                          </span>
                        ) : null}
                        {durationLabel ? <span>{durationLabel}</span> : null}
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground/90">
                      {submittedByName && submittedLabel ? (
                        <p>
                          Submitted by <span className="font-semibold text-foreground">{submittedByName}</span> ·{" "}
                          {submittedLabel}
                        </p>
                      ) : null}
                      {approverName && approvedLabel && entry.status === "APPROVED" ? (
                        <p>
                          Approved by <span className="font-semibold text-foreground">{approverName}</span> ·{" "}
                          {approvedLabel}
                        </p>
                      ) : null}
                      {entry.notes ? <p className="text-sm text-foreground/80">Note: {entry.notes}</p> : null}
                      {entry.rejectionReason ? (
                        <p className="text-sm font-semibold text-destructive">Needs update: {entry.rejectionReason}</p>
                      ) : null}
                      {clockInLocation ? (
                        <p className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
                          Start · {clockInLocation}
                        </p>
                      ) : null}
                      {clockOutLocation ? (
                        <p className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
                          Finish · {clockOutLocation}
                        </p>
                      ) : null}
                    </div>

                    {(approvable || rejectable) && (
                      <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                          Supervisor review
                        </p>
                        <textarea
                          value={approvalNotes[entry.id] ?? ""}
                          onChange={(event) =>
                            setApprovalNotes((current) => ({ ...current, [entry.id]: event.target.value }))
                          }
                          placeholder="Add a quick note (optional)"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          rows={2}
                        />
                        {rejectable ? (
                          <input
                            value={rejectionReasons[entry.id] ?? ""}
                            onChange={(event) =>
                              setRejectionReasons((current) => ({ ...current, [entry.id]: event.target.value }))
                            }
                            placeholder="Reason for adjustment"
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          {approvable ? (
                            <button
                              type="button"
                              onClick={() => handleApprove(entry.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={approvingThisEntry || rejectingThisEntry}
                            >
                              {approvingThisEntry ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Check className="h-3 w-3" aria-hidden="true" />
                              )}
                              Approve
                            </button>
                          ) : null}
                          {rejectable ? (
                            <button
                              type="button"
                              onClick={() => handleReject(entry.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-destructive px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={rejectingThisEntry || approvingThisEntry}
                            >
                              {rejectingThisEntry ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <XOctagon className="h-3 w-3" aria-hidden="true" />
                              )}
                              Request changes
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Materials</p>
            <button
              type="button"
              onClick={() => materialsQuery.refetch()}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
              disabled={materialsQuery.isLoading || materialsQuery.isRefetching}
            >
              <RefreshCw
                className={`h-3 w-3 ${materialsQuery.isRefetching ? "animate-spin text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>

          <div className="space-y-2 rounded-2xl border border-border/50 bg-background px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                value={materialDraft.sku}
                onChange={(event) =>
                  setMaterialDraft((current) => ({
                    ...current,
                    sku: event.target.value,
                  }))
                }
                placeholder="SKU or description"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={materialDraft.costCode}
                onChange={(event) =>
                  setMaterialDraft((current) => ({
                    ...current,
                    costCode: event.target.value,
                  }))
                }
                placeholder="Cost code"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={materialDraft.quantity}
                onChange={(event) =>
                  setMaterialDraft((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
                placeholder="Quantity"
                inputMode="decimal"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={materialDraft.unitCost}
                onChange={(event) =>
                  setMaterialDraft((current) => ({
                    ...current,
                    unitCost: event.target.value,
                  }))
                }
                placeholder="Unit cost"
                inputMode="decimal"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <textarea
              value={materialDraft.notes}
              onChange={(event) =>
                setMaterialDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateMaterial}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={createMaterialMutation.isPending}
              >
                {createMaterialMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Package className="h-3 w-3" aria-hidden="true" />
                )}
                Log material
              </button>
            </div>
          </div>

          {materialsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              Loading materials…
            </div>
          ) : materialsQuery.error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Unable to load materials. {materialsQuery.error.message}
            </p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-muted-foreground/80">
              No materials logged yet. Capture what the crew used so costs stay on track.
            </p>
          ) : (
            <div className="space-y-3">
              {materials.map((entry) => {
                const recordedByName = entry.recordedBy
                  ? formatTeamMemberName(entry.recordedBy.id, teamMembersById)
                  : "Crew member";
                const approverName = entry.approver ? formatTeamMemberName(entry.approver.id, teamMembersById) : null;
                const createdLabel = formatRelativeTimestamp(entry.createdAt);
                const approvedLabel = entry.approvedAt ? formatRelativeTimestamp(entry.approvedAt) : null;
                const approvingMaterial =
                  approveMaterialMutation.isPending &&
                  approveMaterialMutation.variables?.entryId === entry.id;
                const rejectingMaterial =
                  rejectMaterialMutation.isPending &&
                  rejectMaterialMutation.variables?.entryId === entry.id;
                const quantityLabel = formatQuantity(entry.quantity);
                const totalLabel = formatCurrency(entry.totalCost ?? entry.quantity * entry.unitCost);
                const reviewNote = materialReviewNotes[entry.id] ?? "";
                const rejectionReason = materialRejectionReasons[entry.id] ?? "";
                const canReview = entry.approvalStatus === "SUBMITTED";

                return (
                  <div key={entry.id} className="space-y-3 rounded-xl border border-border/40 bg-background px-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/70">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${materialStatusStyles[entry.approvalStatus]}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current opacity-70" aria-hidden="true" />
                          {materialStatusLabels[entry.approvalStatus]}
                        </span>
                        <span className="text-muted-foreground">{recordedByName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80">
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3 w-3 text-primary" aria-hidden="true" />
                          {quantityLabel} × {formatCurrency(entry.unitCost)}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <DollarSign className="h-3 w-3 text-primary" aria-hidden="true" />
                          {totalLabel}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground/90">
                      <p>Logged {createdLabel}</p>
                      {entry.costCode ? <p>Cost code: {entry.costCode}</p> : null}
                      {entry.notes ? <p className="text-sm text-foreground/80">Notes: {entry.notes}</p> : null}
                      {entry.approvalNote ? (
                        <p className="text-sm text-foreground/80">Supervisor note: {entry.approvalNote}</p>
                      ) : null}
                      {entry.rejectionReason ? (
                        <p className="text-sm font-semibold text-destructive">Needs update: {entry.rejectionReason}</p>
                      ) : null}
                      {approverName && approvedLabel ? (
                        <p>
                          Approved by <span className="font-semibold text-foreground">{approverName}</span> ·{" "}
                          {approvedLabel}
                        </p>
                      ) : null}
                    </div>

                    {canReview && (
                      <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                          Supervisor review
                        </p>
                        <textarea
                          value={reviewNote}
                          onChange={(event) =>
                            setMaterialReviewNotes((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          placeholder="Add a quick note (optional)"
                          rows={2}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <input
                          value={rejectionReason}
                          onChange={(event) =>
                            setMaterialRejectionReasons((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          placeholder="Reason if requesting changes"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproveMaterialEntry(entry.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={approvingMaterial || rejectingMaterial}
                          >
                            {approvingMaterial ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Check className="h-3 w-3" aria-hidden="true" />
                            )}
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectMaterialEntry(entry.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-destructive px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={rejectingMaterial || approvingMaterial}
                          >
                            {rejectingMaterial ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <XOctagon className="h-3 w-3" aria-hidden="true" />
                            )}
                            Request changes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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

const timeEntryStatusLabels: Record<TimeEntryStatus, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ADJUSTMENT_REQUESTED: "Needs update",
};

const timeEntryStatusStyles: Record<TimeEntryStatus, string> = {
  IN_PROGRESS: "border-amber-300 bg-amber-100 text-amber-800",
  SUBMITTED: "border-sky-300 bg-sky-100 text-sky-800",
  APPROVED: "border-emerald-300 bg-emerald-100 text-emerald-800",
  REJECTED: "border-rose-400 bg-rose-100 text-rose-800",
  ADJUSTMENT_REQUESTED: "border-orange-300 bg-orange-100 text-orange-800",
};

const materialStatusLabels: Record<MaterialApprovalStatus, string> = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Needs update",
};

const materialStatusStyles: Record<MaterialApprovalStatus, string> = {
  SUBMITTED: "border-sky-300 bg-sky-100 text-sky-800",
  APPROVED: "border-emerald-300 bg-emerald-100 text-emerald-800",
  REJECTED: "border-rose-400 bg-rose-100 text-rose-800",
};

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

function formatTimeRange(clockIn: string, clockOut: string | null) {
  const start = new Date(clockIn);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const end = clockOut ? new Date(clockOut) : null;
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const startLabel = formatter.format(start);
  if (!end || Number.isNaN(end.getTime())) {
    return `${startLabel} —`;
  }
  return `${startLabel} - ${formatter.format(end)}`;
}

function formatDuration(minutes: number | null, seconds: number | null) {
  const totalMinutes =
    typeof minutes === "number" && Number.isFinite(minutes)
      ? minutes
      : typeof seconds === "number" && Number.isFinite(seconds)
        ? Math.round(seconds / 60)
        : null;
  if (totalMinutes === null) {
    return null;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (hours && remainingMinutes) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${remainingMinutes}m`;
}

function formatRelativeTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const relative = relativeTimeFromNow(date);
  const absolute = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return relative ? `${relative} · ${absolute}` : absolute;
}

function formatQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return "0";
  }
  return Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(2);
}

function formatCurrency(amount: number) {
  if (!Number.isFinite(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
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

function formatTeamMemberName(userId: string, map: Record<string, TeamMember>) {
  const member = map[userId];
  if (!member) {
    return "Crew member";
  }
  return member.name?.trim() || member.email || "Crew member";
}

function relativeTimeFromNow(date: Date) {
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 1) {
    return formatter.format(Math.round(diffMs / 1000), "second");
  }
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

function formatLocation(location: TimeEntrySummary["clockInLocation"]) {
  if (!location) {
    return null;
  }
  const { lat, lng, accuracy } = location;
  const latLabel = Number.isFinite(lat) ? lat.toFixed(4) : null;
  const lngLabel = Number.isFinite(lng) ? lng.toFixed(4) : null;
  if (!latLabel || !lngLabel) {
    return null;
  }
  const accuracyLabel =
    typeof accuracy === "number" && Number.isFinite(accuracy) ? `±${Math.round(accuracy)}m` : null;
  return accuracyLabel ? `${latLabel}, ${lngLabel} (${accuracyLabel})` : `${latLabel}, ${lngLabel}`;
}
