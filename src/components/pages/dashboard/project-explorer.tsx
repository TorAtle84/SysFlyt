"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  FolderKanban,
  Plus,
  FileText,
  Users,
  ChevronRight,
  Building2,
  Calendar,
  Search,
  Archive,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: { userId: string; role: string }[];
  _count: {
    documents: number;
    members: number;
    massList: number;
    mcProtocols: number;
    functionTests: number;
  };
}

interface ProjectExplorerProps {
  mine: Project[];
  invited: Project[];
  canCreate: boolean;
  canDelete: boolean;
  userDiscipline?: string;
}

export function ProjectExplorer({
  mine,
  invited,
  canCreate,
  canDelete,
  userDiscipline,
}: ProjectExplorerProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const allProjects = useMemo(() => {
    const combined = [...mine, ...invited.filter((p) => !mine.some((m) => m.id === p.id))];
    return combined;
  }, [mine, invited]);

  const filteredProjects = useMemo(() => {
    let projects = allProjects;

    if (showArchived) {
      projects = projects.filter((p) => p.status === "ARCHIVED");
    } else {
      projects = projects.filter((p) => p.status === "ACTIVE");
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    return projects;
  }, [allProjects, showArchived, searchQuery]);

  const activeCount = allProjects.filter((p) => p.status === "ACTIVE").length;
  const archivedCount = allProjects.filter((p) => p.status === "ARCHIVED").length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setName("");
        setDescription("");
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error("Kunne ikke opprette prosjekt");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(projectId: string) {
    setActionLoading(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/archive`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Prosjekt arkivert");
        router.refresh();
      } else {
        toast.error("Kunne ikke arkivere prosjekt");
      }
    } catch (err) {
      console.error(err);
      toast.error("Noe gikk galt");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRestore(projectId: string) {
    setActionLoading(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Prosjekt gjenopprettet");
        router.refresh();
      } else {
        toast.error("Kunne ikke gjenopprette prosjekt");
      }
    } catch (err) {
      console.error(err);
      toast.error("Noe gikk galt");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(projectId: string) {
    setActionLoading(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/archive`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteConfirmId(null);
        toast.success("Prosjekt slettet");
        router.refresh();
      } else {
        const error = await res.json();
        toast.error(error.error || "Kunne ikke slette prosjekt");
      }
    } catch (err) {
      console.error(err);
      toast.error("Noe gikk galt under sletting");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="text-primary" size={20} />
              {showArchived ? "Arkiverte prosjekter" : "Mine prosjekter"}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredProjects.length} prosjekt{filteredProjects.length !== 1 ? "er" : ""}
            </p>
          </div>
          {canCreate && !showArchived && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus size={16} className="mr-1" />
                  Nytt prosjekt
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Opprett nytt prosjekt</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <Input
                    label="Prosjektnavn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="F.eks. Fjord Tower U1"
                    required
                  />
                  <Textarea
                    label="Beskrivelse"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Kort beskrivelse av prosjektet..."
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
                      Opprett
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              type="search"
              placeholder="Søk etter prosjekt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={!showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived(false)}
            >
              Aktive ({activeCount})
            </Button>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived(true)}
            >
              <Archive size={14} className="mr-1" />
              Arkiv ({archivedCount})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredProjects.length === 0 ? (
          <div className="py-12 text-center">
            {showArchived ? (
              <>
                <Archive className="mx-auto mb-4 text-muted-foreground" size={48} />
                <p className="text-muted-foreground">Ingen arkiverte prosjekter</p>
              </>
            ) : searchQuery ? (
              <>
                <Search className="mx-auto mb-4 text-muted-foreground" size={48} />
                <p className="text-muted-foreground">Ingen prosjekter matcher søket</p>
              </>
            ) : (
              <>
                <FolderKanban className="mx-auto mb-4 text-muted-foreground" size={48} />
                <p className="text-muted-foreground">Ingen prosjekter enda</p>
                {canCreate && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Klikk &quot;Nytt prosjekt&quot; for å komme i gang
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group relative rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-primary/50 hover:shadow-md"
              >
                <Link
                  href={`/projects/${project.id}`}
                  className="block"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="text-primary" size={18} />
                      <h3 className="font-semibold text-foreground group-hover:text-primary">
                        {project.name}
                      </h3>
                    </div>
                    <ChevronRight
                      className="text-muted-foreground transition-transform group-hover:translate-x-1"
                      size={18}
                    />
                  </div>

                  {project.description && (
                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText size={12} />
                      {project._count.documents} dok
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {project._count.members} medlem{project._count.members !== 1 ? "mer" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {format(new Date(project.updatedAt), "d. MMM", { locale: nb })}
                    </span>
                  </div>

                  <div className="mt-3">
                    <Badge tone={project.status === "ARCHIVED" ? "warning" : "info"} className="text-xs">
                      {project.status === "ARCHIVED" ? "Arkivert" : "Aktiv"}
                    </Badge>
                  </div>
                </Link>

                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  {project.status === "ACTIVE" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        handleArchive(project.id);
                      }}
                      loading={actionLoading === project.id}
                    >
                      <Archive size={12} className="mr-1" />
                      Arkiver
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          handleRestore(project.id);
                        }}
                        loading={actionLoading === project.id}
                      >
                        <RotateCcw size={12} className="mr-1" />
                        Gjenopprett
                      </Button>
                      {canDelete && (
                        <Dialog open={deleteConfirmId === project.id} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                setDeleteConfirmId(project.id);
                              }}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Slett prosjekt permanent?</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              Er du sikker på at du vil slette &quot;{project.name}&quot;?
                              Denne handlingen kan ikke angres, og alle dokumenter og data vil bli slettet.
                            </p>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                Avbryt
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleDelete(project.id)}
                                loading={actionLoading === project.id}
                              >
                                Slett permanent
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
        }
      </CardContent >
    </Card >
  );
}
