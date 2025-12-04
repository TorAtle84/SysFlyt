"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
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
  createdAt: Date;
  updatedAt: Date;
  members: { user: { firstName: string; lastName: string } }[];
  documents: { id: string }[];
}

interface ProjectExplorerProps {
  mine: Project[];
  invited: Project[];
  canCreate: boolean;
  userDiscipline?: string;
}

export function ProjectExplorer({
  mine,
  invited,
  canCreate,
  userDiscipline,
}: ProjectExplorerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const allProjects = [...mine, ...invited.filter((p) => !mine.some((m) => m.id === p.id))];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="text-primary" size={20} />
            Mine prosjekter
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {allProjects.length} prosjekt{allProjects.length !== 1 ? "er" : ""}
          </p>
        </div>
        {canCreate && (
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
      </CardHeader>
      <CardContent>
        {allProjects.length === 0 ? (
          <div className="py-12 text-center">
            <FolderKanban className="mx-auto mb-4 text-muted-foreground" size={48} />
            <p className="text-muted-foreground">Ingen prosjekter enda</p>
            {canCreate && (
              <p className="mt-2 text-sm text-muted-foreground">
                Klikk &quot;Nytt prosjekt&quot; for å komme i gang
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-primary/50 hover:shadow-md"
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
                    {project.documents.length} dok
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {project.members.length} medlem{project.members.length !== 1 ? "mer" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {format(new Date(project.updatedAt), "d. MMM", { locale: nb })}
                  </span>
                </div>

                <div className="mt-3">
                  <Badge tone="info" className="text-xs">
                    {project.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
