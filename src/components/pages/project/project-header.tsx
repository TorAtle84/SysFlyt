"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Users, Calendar, Edit2, Archive, RotateCcw, X, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MemberInvite } from "./member-invite";

interface ProjectMember {
  id: string;
  role: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface ProjectHeaderProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    createdById: string | null;
    members: ProjectMember[];
  };
  canEdit: boolean;
  currentUserId: string;
}

export function ProjectHeader({ project, canEdit, currentUserId }: ProjectHeaderProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const isArchived = project.status === "ARCHIVED";

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.ok) {
        setDialogOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    setArchiveLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/archive`, {
        method: "POST",
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setArchiveLoading(false);
    }
  }

  async function handleRestore() {
    setArchiveLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setArchiveLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingMemberId(userId);
    try {
      const res = await fetch(`/api/projects/${project.id}/members?userId=${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingMemberId(null);
    }
  }

  const roleLabels: Record<string, string> = {
    ADMIN: "Admin",
    PROJECT_LEADER: "Prosjektleder",
    USER: "Bruker",
    READER: "Leser",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <Badge tone={isArchived ? "warning" : "info"}>
              {isArchived ? "Arkivert" : "Aktiv"}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-2 text-muted-foreground">{project.description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users size={14} />
              {project.members.length} medlem{project.members.length !== 1 ? "mer" : ""}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              Opprettet {format(new Date(project.createdAt), "d. MMM yyyy", { locale: nb })}
            </span>
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {isArchived ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                loading={archiveLoading}
              >
                <RotateCcw size={14} className="mr-1" />
                Gjenopprett
              </Button>
            ) : (
              <>
                <MemberInvite projectId={project.id} />
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Edit2 size={14} className="mr-1" />
                      Rediger
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Rediger prosjekt</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4">
                      <Input
                        label="Prosjektnavn"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                      <Textarea
                        label="Beskrivelse"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setDialogOpen(false)}
                        >
                          Avbryt
                        </Button>
                        <Button type="submit" loading={loading}>
                          Lagre
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleArchive}
                  loading={archiveLoading}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Archive size={14} className="mr-1" />
                  Arkiver
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {project.members.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Medlemmer</h3>
          <div className="flex flex-wrap gap-2">
            {project.members.map((member) => {
              const isCreator = project.createdById === member.user.id;
              const isCurrentUser = member.user.id === currentUserId;
              const canRemove = canEdit && !isCreator && !isCurrentUser;

              return (
                <div
                  key={member.id}
                  className="group flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                    {member.user.firstName[0]}
                    {member.user.lastName[0]}
                  </div>
                  <span>
                    {member.user.firstName} {member.user.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({roleLabels[member.role] || member.role})
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      className="ml-1 hidden rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:block"
                      onClick={() => handleRemoveMember(member.user.id)}
                      disabled={removingMemberId === member.user.id}
                      title="Fjern medlem"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
