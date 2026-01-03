"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileSearch, Plus, FolderOpen, Clock, ArrowRight, Loader2 } from "lucide-react";

interface KravsporingProject {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    _count: {
        analyses: number;
        disciplines: number;
    };
}

export default function KravsporingPage() {
    const [projects, setProjects] = useState<KravsporingProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newProject, setNewProject] = useState({ name: "", description: "" });

    useEffect(() => {
        loadProjects();
    }, []);

    async function loadProjects() {
        try {
            const res = await fetch("/api/flytlink/kravsporing/projects");
            if (!res.ok) throw new Error("Kunne ikke laste prosjekter");
            const data = await res.json();
            setProjects(data.projects || []);
        } catch (error) {
            toast.error("Kunne ikke laste prosjekter");
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateProject(e: React.FormEvent) {
        e.preventDefault();
        if (!newProject.name.trim()) {
            toast.error("Prosjektnavn er påkrevd");
            return;
        }

        setCreating(true);
        try {
            const res = await fetch("/api/flytlink/kravsporing/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newProject),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Kunne ikke opprette prosjekt");
            }

            const data = await res.json();
            toast.success("Prosjekt opprettet!");
            setDialogOpen(false);
            setNewProject({ name: "", description: "" });
            loadProjects();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "En feil oppstod");
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <FileSearch className="h-8 w-8 text-primary" />
                        Kravsporing
                    </h1>
                    <p className="text-muted-foreground">
                        Organiser og analyser krav fra prosjektdokumenter
                    </p>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                            <Plus className="h-4 w-4 mr-2" />
                            Nytt prosjekt
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <form onSubmit={handleCreateProject}>
                            <DialogHeader>
                                <DialogTitle>Opprett nytt kravsporing-prosjekt</DialogTitle>
                                <DialogDescription>
                                    Et prosjekt samler alle analyser og krav på ett sted
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Prosjektnavn *</Label>
                                    <Input
                                        id="name"
                                        placeholder="F.eks. Klatrehall - Ventilasjon"
                                        value={newProject.name}
                                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Beskrivelse (valgfri)</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Kort beskrivelse av prosjektet..."
                                        value={newProject.description}
                                        onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                    Avbryt
                                </Button>
                                <Button type="submit" disabled={creating}>
                                    {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Opprett
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Project List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : projects.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">Ingen prosjekter ennå</h3>
                        <p className="text-muted-foreground mb-4 max-w-md">
                            Opprett ditt første kravsporing-prosjekt for å komme i gang med dokumentanalyse
                        </p>
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Opprett prosjekt
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {projects.map((project) => (
                        <Link key={project.id} href={`/flytlink/kravsporing/${project.id}`}>
                            <Card className="group cursor-pointer hover:border-primary/50 transition-colors h-full">
                                <CardHeader>
                                    <CardTitle className="group-hover:text-primary transition-colors">
                                        {project.name}
                                    </CardTitle>
                                    {project.description && (
                                        <CardDescription className="line-clamp-2">
                                            {project.description}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                                        <div className="flex items-center gap-4">
                                            <span>{project._count.analyses} analyser</span>
                                            <span>{project._count.disciplines} fag</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            <span>{new Date(project.createdAt).toLocaleDateString("nb-NO")}</span>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
