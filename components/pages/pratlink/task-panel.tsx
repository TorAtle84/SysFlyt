"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Ban,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  dueDate: string | null;
  responsibleUser: User | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdFromMessage: {
    id: string;
    content: string;
    room: { id: string; name: string };
  } | null;
  createdAt: string;
}

interface TaskPanelProps {
  projectId: string;
  members: User[];
  onNavigateToMessage?: (roomId: string, messageId: string) => void;
}

const statusConfig = {
  OPEN: { icon: Circle, label: "Åpen", color: "text-blue-500" },
  IN_PROGRESS: { icon: Clock, label: "Pågår", color: "text-orange-500" },
  DONE: { icon: CheckCircle2, label: "Fullført", color: "text-green-500" },
  CANCELLED: { icon: Ban, label: "Kansellert", color: "text-muted-foreground" },
};

export function TaskPanel({
  projectId,
  members,
  onNavigateToMessage,
}: TaskPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "all" | "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"
  >("all");
  const [showMyTasks, setShowMyTasks] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResponsibleId, setNewResponsibleId] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [projectId, filter, showMyTasks]);

  async function fetchTasks() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("status", filter);
      }
      if (showMyTasks) {
        params.set("assignedToMe", "true");
      }

      const res = await fetch(
        `/api/pratlink/projects/${projectId}/tasks?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    try {
      const res = await fetch(`/api/pratlink/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          responsibleUserId: newResponsibleId || null,
          dueDate: newDueDate || null,
        }),
      });

      if (res.ok) {
        setNewTitle("");
        setNewDescription("");
        setNewResponsibleId("");
        setNewDueDate("");
        setShowCreateForm(false);
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    taskId: string,
    status: Task["status"]
  ) {
    try {
      const res = await fetch(`/api/pratlink/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  }

  const filteredTasks = tasks;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground">Oppgaver</h2>
          <Badge variant="secondary">{tasks.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus size={16} className="mr-1" />
          Ny oppgave
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">Alle statuser</option>
          <option value="OPEN">Åpne</option>
          <option value="IN_PROGRESS">Pågår</option>
          <option value="DONE">Fullført</option>
          <option value="CANCELLED">Kansellert</option>
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showMyTasks}
            onChange={(e) => setShowMyTasks(e.target.checked)}
            className="rounded border-input"
          />
          Mine oppgaver
        </label>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateTask}
          className="space-y-3 border-b border-border bg-muted/50 p-4"
        >
          <Input
            placeholder="Oppgavetittel..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />

          <textarea
            placeholder="Beskrivelse (valgfritt)..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            rows={2}
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={newResponsibleId}
              onChange={(e) => setNewResponsibleId(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Velg ansvarlig...</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName}
                </option>
              ))}
            </select>

            <Input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              placeholder="Frist"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" size="sm" disabled={creating || !newTitle.trim()}>
              {creating ? (
                <Loader2 size={16} className="mr-1 animate-spin" />
              ) : null}
              Opprett
            </Button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 opacity-50" size={32} />
            <p>Ingen oppgaver</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTasks.map((task) => {
              const config = statusConfig[task.status];
              const StatusIcon = config.icon;
              const isExpanded = expandedTaskId === task.id;

              return (
                <div key={task.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() =>
                        handleStatusChange(
                          task.id,
                          task.status === "DONE" ? "OPEN" : "DONE"
                        )
                      }
                      className={cn(
                        "mt-0.5 transition-colors hover:opacity-70",
                        config.color
                      )}
                      title={
                        task.status === "DONE"
                          ? "Marker som åpen"
                          : "Marker som fullført"
                      }
                    >
                      <StatusIcon size={20} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() =>
                          setExpandedTaskId(isExpanded ? null : task.id)
                        }
                        className="flex w-full items-center justify-between text-left"
                      >
                        <span
                          className={cn(
                            "font-medium text-foreground",
                            task.status === "DONE" && "line-through opacity-60",
                            task.status === "CANCELLED" &&
                              "line-through opacity-60"
                          )}
                        >
                          {task.title}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-muted-foreground" />
                        ) : (
                          <ChevronDown size={16} className="text-muted-foreground" />
                        )}
                      </button>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {task.responsibleUser && (
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {task.responsibleUser.firstName}{" "}
                            {task.responsibleUser.lastName}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {format(new Date(task.dueDate), "d. MMM yyyy", {
                              locale: nb,
                            })}
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {config.label}
                        </Badge>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {task.description && (
                            <p className="text-sm text-muted-foreground">
                              {task.description}
                            </p>
                          )}

                          {task.createdFromMessage && (
                            <button
                              onClick={() =>
                                onNavigateToMessage?.(
                                  task.createdFromMessage!.room.id,
                                  task.createdFromMessage!.id
                                )
                              }
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <MessageSquare size={12} />
                              Opprettet fra melding i #
                              {task.createdFromMessage.room.name}
                            </button>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {task.status !== "IN_PROGRESS" &&
                              task.status !== "DONE" &&
                              task.status !== "CANCELLED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleStatusChange(task.id, "IN_PROGRESS")
                                  }
                                >
                                  <Clock size={14} className="mr-1" />
                                  Start
                                </Button>
                              )}
                            {task.status !== "DONE" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleStatusChange(task.id, "DONE")
                                }
                              >
                                <CheckCircle2 size={14} className="mr-1" />
                                Fullført
                              </Button>
                            )}
                            {task.status !== "CANCELLED" &&
                              task.status !== "DONE" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleStatusChange(task.id, "CANCELLED")
                                  }
                                >
                                  <Ban size={14} className="mr-1" />
                                  Kanseller
                                </Button>
                              )}
                          </div>

                          <p className="text-[11px] text-muted-foreground">
                            Opprettet{" "}
                            {format(new Date(task.createdAt), "d. MMM yyyy", {
                              locale: nb,
                            })}
                            {task.createdBy &&
                              ` av ${task.createdBy.firstName} ${task.createdBy.lastName}`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
