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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileSearch, Plus, FolderOpen, Clock, ArrowRight, Loader2, MoreVertical, Archive, RotateCcw, Trash2 } from "lucide-react";

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

    // New state for tabs and actions
    const [activeTab, setActiveTab] = useState("active");
    const [projectToAction, setProjectToAction] = useState<KravsporingProject | null>(null);
    const [actionType, setActionType] = useState<"archive" | "restore" | "delete" | null>(null);

    useEffect(() => {
        loadProjects(activeTab === "archived");
    }, [activeTab]);

    async function loadProjects(isArchived = false) {
        setLoading(true);
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects?archived=${isArchived}`);
            if (!res.ok) throw new Error("Kunne ikke laste prosjekter");
            const data = await res.json();
            setProjects(data.projects || []);
        } catch (error) {
            toast.error("Kunne ikke laste prosjekter");
        } finally {
            setLoading(false);
        }
    }

    async function handleActionConfirm() {
        if (!projectToAction || !actionType) return;

        try {
            let res;
            if (actionType === "delete") {
                // Permanent delete
                res = await fetch(`/api/flytlink/kravsporing/projects/${projectToAction.id}?permanent=true`, {
                    method: "DELETE",
                });
            } else if (actionType === "restore") {
                // Restore
                res = await fetch(`/api/flytlink/kravsporing/projects/${projectToAction.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ restore: true }),
                });
            } else if (actionType === "archive") {
                // Archive (Soft delete)
                res = await fetch(`/api/flytlink/kravsporing/projects/${projectToAction.id}`, {
                    method: "DELETE",
                });
            }

            if (!res?.ok) throw new Error("Handling feilet");

            toast.success(
                actionType === "delete" ? "Prosjekt slettet permanent" :
                    actionType === "restore" ? "Prosjekt gjenopprettet" : "Prosjekt arkivert"
            );

            setProjectToAction(null);
            setActionType(null);
            loadProjects(activeTab === "archived");
        } catch (error) {
            toast.error("Noe gikk galt");
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

            {/* Tabs and Project List */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="active">Aktive prosjekter</TabsTrigger>
                    <TabsTrigger value="archived">Arkiverte prosjekter</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab}>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : projects.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium mb-2">Ingen {activeTab === "active" ? "aktive" : "arkiverte"} prosjekter</h3>
                                <p className="text-muted-foreground mb-4 max-w-md">
                                    {activeTab === "active"
                                        ? "Opprett ditt første kravsporing-prosjekt for å komme i gang"
                                        : "Arkiverte prosjekter vil vises her"}
                                </p>
                                {activeTab === "active" && (
                                    <Button onClick={() => setDialogOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Opprett prosjekt
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {projects.map((project) => (
                                <div key={project.id} className="relative group h-full">
                                    <Link href={`/flytlink/kravsporing/${project.id}`} className="block h-full">
                                        <Card className="hover:border-primary/50 transition-colors h-full">
                                            <CardHeader>
                                                <div className="flex justify-between items-start">
                                                    <CardTitle className="group-hover:text-primary transition-colors pr-8">
                                                        {project.name}
                                                    </CardTitle>
                                                </div>
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
                                                <div className="mt-4 flex justify-between items-end">
                                                    <span className="text-xs text-muted-foreground">
                                                        {activeTab === "archived" ? "Arkivert" : "Aktiv"}
                                                    </span>
                                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>

                                    {/* Actions Menu */}
                                    <div className="absolute top-4 right-4 z-10">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 backdrop-blur-sm hover:bg-background">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {activeTab === "active" ? (
                                                    <DropdownMenuItem
                                                        className="text-amber-500 focus:text-amber-500"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setProjectToAction(project);
                                                            setActionType("archive");
                                                        }}
                                                    >
                                                        <Archive className="h-4 w-4 mr-2" />
                                                        Arkiver prosjekt
                                                    </DropdownMenuItem>
                                                ) : (
                                                    <>
                                                        <DropdownMenuItem
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setProjectToAction(project);
                                                                setActionType("restore");
                                                            }}
                                                        >
                                                            <RotateCcw className="h-4 w-4 mr-2" />
                                                            Gjenopprett
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setProjectToAction(project);
                                                                setActionType("delete");
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Slett permanent
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <AlertDialog open={!!projectToAction} onOpenChange={(open: boolean) => !open && setProjectToAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {actionType === "archive" ? "Arkiver prosjekt?" :
                                actionType === "restore" ? "Gjenopprett prosjekt?" :
                                    "Slett prosjekt permanent?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {actionType === "archive" ? "Prosjektet vil bli flyttet til arkivet og kan gjenopprettes senere." :
                                actionType === "restore" ? "Prosjektet vil bli flyttet tilbake til aktive prosjekter." :
                                    "Dette vil slette prosjektet og alle tilhørende analyser permanent. Handlingen kan ikke angres."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className={actionType === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
                            onClick={handleActionConfirm}
                        >
                            {actionType === "archive" ? "Arkiver" :
                                actionType === "restore" ? "Gjenopprett" :
                                    "Slett"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
