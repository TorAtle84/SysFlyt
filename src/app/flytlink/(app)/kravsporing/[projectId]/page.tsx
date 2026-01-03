"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    FileSearch,
    Upload,
    ArrowLeft,
    FileText,
    File,
    X,
    Loader2,
    BarChart3,
    List,
    Settings,
    Play,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = {
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "text/plain": [".txt"],
    "application/vnd.ms-outlook": [".msg"],
};

interface Discipline {
    id: string;
    name: string;
    color: string;
}

interface Analysis {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    _count: {
        files: number;
        requirements: number;
    };
}

interface Project {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    disciplines: Discipline[];
    analyses: Analysis[];
    _count: {
        analyses: number;
    };
}

function getFileIcon(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FileText className="h-6 w-6 text-red-500" />;
    if (["doc", "docx"].includes(ext || "")) return <FileText className="h-6 w-6 text-blue-500" />;
    if (["xls", "xlsx"].includes(ext || "")) return <FileText className="h-6 w-6 text-green-500" />;
    return <File className="h-6 w-6 text-muted-foreground" />;
}

export default function KravsporingProjectPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.projectId as string;

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [files, setFiles] = useState<File[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        loadProject();
    }, [projectId]);

    async function loadProject() {
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}`);
            if (!res.ok) throw new Error("Kunne ikke laste prosjekt");
            const data = await res.json();
            setProject(data.project);
        } catch (error) {
            toast.error("Kunne ikke laste prosjekt");
            router.push("/flytlink/kravsporing");
        } finally {
            setLoading(false);
        }
    }

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles((prev) => {
            const existing = new Set(prev.map((f) => f.name));
            const newFiles = acceptedFiles.filter((f) => !existing.has(f.name));
            return [...prev, ...newFiles];
        });
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPTED_TYPES,
        maxFiles: 50,
        maxSize: 50 * 1024 * 1024,
    });

    const removeFile = (fileName: string) => {
        setFiles((prev) => prev.filter((f) => f.name !== fileName));
    };

    const handleAnalyze = async () => {
        if (files.length === 0) {
            toast.error("Velg minst én fil å analysere");
            return;
        }

        setAnalyzing(true);
        setProgress(0);

        try {
            // TODO: Implement actual file upload and analysis
            const interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) {
                        clearInterval(interval);
                        return prev;
                    }
                    return prev + Math.random() * 15;
                });
            }, 500);

            await new Promise((resolve) => setTimeout(resolve, 3000));

            clearInterval(interval);
            setProgress(100);
            toast.success("Analyse fullført!");
            setFiles([]);
            loadProject(); // Refresh project data
        } catch (err) {
            toast.error("Analyse feilet");
        } finally {
            setAnalyzing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!project) {
        return null;
    }

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/flytlink/kravsporing">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                    {project.description && (
                        <p className="text-muted-foreground">{project.description}</p>
                    )}
                </div>
            </div>

            {/* Discipline Overview */}
            <div className="flex flex-wrap gap-2">
                {project.disciplines.map((d) => (
                    <Badge
                        key={d.id}
                        variant="outline"
                        className="px-3 py-1"
                        style={{ borderColor: d.color, color: d.color }}
                    >
                        {d.name}
                    </Badge>
                ))}
            </div>

            <Tabs defaultValue="analyze" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="analyze" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Ny analyse
                    </TabsTrigger>
                    <TabsTrigger value="analyses" className="gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Analyser ({project._count.analyses})
                    </TabsTrigger>
                    <TabsTrigger value="requirements" className="gap-2">
                        <List className="h-4 w-4" />
                        Krav
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="gap-2">
                        <Settings className="h-4 w-4" />
                        Innstillinger
                    </TabsTrigger>
                </TabsList>

                {/* Analyze Tab */}
                <TabsContent value="analyze" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Last opp dokumenter</CardTitle>
                            <CardDescription>
                                Last opp filer for analyse. Kravene legges til i dette prosjektet.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
                                    isDragActive
                                        ? "border-primary bg-primary/5"
                                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                                )}
                            >
                                <input {...getInputProps()} />
                                <Upload className={cn("h-12 w-12 mb-4", isDragActive ? "text-primary" : "text-muted-foreground")} />
                                <p className="text-center text-sm text-muted-foreground">
                                    {isDragActive ? (
                                        <span className="text-primary font-medium">Slipp filene her...</span>
                                    ) : (
                                        <>
                                            <span className="font-medium">Dra og slipp filer her</span>
                                            <br />
                                            eller klikk for å velge
                                        </>
                                    )}
                                </p>
                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                                        <span>{files.length} fil(er) valgt</span>
                                        <span>{totalSizeMB} MB</span>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {files.map((file) => (
                                            <div
                                                key={file.name}
                                                className="flex items-center gap-3 rounded-lg border bg-muted/50 p-2"
                                            >
                                                {getFileIcon(file.name)}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {(file.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => removeFile(file.name)}
                                                    disabled={analyzing}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {analyzing && (
                                <div className="space-y-2">
                                    <Progress value={progress} className="h-2" />
                                    <p className="text-sm text-muted-foreground text-center">
                                        Analyserer dokumenter... {Math.round(progress)}%
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setFiles([])}
                                    disabled={files.length === 0 || analyzing}
                                >
                                    Fjern alle
                                </Button>
                                <Button
                                    onClick={handleAnalyze}
                                    disabled={files.length === 0 || analyzing}
                                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                                >
                                    <Play className="h-4 w-4 mr-2" />
                                    {analyzing ? "Analyserer..." : "Start analyse"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Analyses Tab */}
                <TabsContent value="analyses" className="space-y-4">
                    {project.analyses.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium mb-2">Ingen analyser ennå</h3>
                                <p className="text-muted-foreground text-center max-w-md">
                                    Last opp dokumenter for å starte din første analyse
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {project.analyses.map((analysis) => (
                                <Card key={analysis.id}>
                                    <CardContent className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "h-10 w-10 rounded-full flex items-center justify-center",
                                                analysis.status === "COMPLETED" && "bg-green-500/10 text-green-500",
                                                analysis.status === "PROCESSING" && "bg-blue-500/10 text-blue-500",
                                                analysis.status === "FAILED" && "bg-red-500/10 text-red-500",
                                                analysis.status === "PENDING" && "bg-yellow-500/10 text-yellow-500"
                                            )}>
                                                {analysis.status === "PROCESSING" ? (
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                ) : analysis.status === "FAILED" ? (
                                                    <AlertCircle className="h-5 w-5" />
                                                ) : (
                                                    <FileSearch className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium">
                                                    {new Date(analysis.startedAt).toLocaleDateString("nb-NO", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {analysis._count.files} filer · {analysis._count.requirements} krav
                                                </p>
                                            </div>
                                        </div>
                                        <Badge variant={
                                            analysis.status === "COMPLETED" ? "default" :
                                                analysis.status === "PROCESSING" ? "secondary" :
                                                    analysis.status === "FAILED" ? "destructive" : "outline"
                                        }>
                                            {analysis.status === "COMPLETED" && "Fullført"}
                                            {analysis.status === "PROCESSING" && "Pågår"}
                                            {analysis.status === "FAILED" && "Feilet"}
                                            {analysis.status === "PENDING" && "Venter"}
                                        </Badge>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Requirements Tab */}
                <TabsContent value="requirements">
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <List className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium mb-2">Kravliste kommer snart</h3>
                            <p className="text-muted-foreground text-center max-w-md">
                                Her vil du kunne se alle identifiserte krav, filtrere per fag, og eksportere
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings">
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium mb-2">Prosjektinnstillinger kommer snart</h3>
                            <p className="text-muted-foreground text-center max-w-md">
                                Her vil du kunne endre navn, legge til fag, og administrere prosjektet
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
