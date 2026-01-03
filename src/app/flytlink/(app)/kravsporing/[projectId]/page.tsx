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
    Key,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RequirementsTable } from "@/components/pages/flytlink/requirements-table";

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
    tokensUsed: number;
    apiCostNok: number;
    geminiCostUsd: number;
    openaiCostUsd: number;
    activeKeys: string | null; // JSON string of active keys
    _count: {
        files: number;
        requirements: number;
    };
}

interface Requirement {
    id: string;
    text: string;
    shortText: string | null;
    score: number;
    status: "ACTIVE" | "INACTIVE" | "DUPLICATE";
    source: string | null;
    disciplineId: string | null;
    discipline: Discipline | null;
    createdAt: string;
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
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingRequirements, setLoadingRequirements] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [analysisStatus, setAnalysisStatus] = useState<{
        stage: string;
        message: string;
        candidatesFound?: number;
        requirementsValidated?: number;
        costNok?: number;
        activeKeys?: string;
    } | null>(null);
    const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);

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

    async function loadRequirements() {
        setLoadingRequirements(true);
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/requirements`);
            if (!res.ok) throw new Error("Kunne ikke laste krav");
            const data = await res.json();
            setRequirements(data.requirements || []);
        } catch (error) {
            console.error("Error loading requirements:", error);
        } finally {
            setLoadingRequirements(false);
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
        setAnalysisStatus({ stage: "starting", message: "Starter analyse..." });

        try {
            // Create FormData with files
            const formData = new FormData();
            files.forEach((file, index) => {
                formData.append(`file${index}`, file);
            });

            // Start analysis
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/analyze`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Kunne ikke starte analyse");
            }

            const { analysisId } = await res.json();
            setCurrentAnalysisId(analysisId);
            toast.success("Analyse startet!");

            // Poll for progress
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(
                        `/api/flytlink/kravsporing/projects/${projectId}/analyze?analysisId=${analysisId}`
                    );
                    if (statusRes.ok) {
                        const { analysis } = await statusRes.json();

                        if (analysis.status === "COMPLETED") {
                            clearInterval(pollInterval);
                            setProgress(100);
                            toast.success(`Analyse fullført! ${analysis._count.requirements} krav funnet.`);
                            setFiles([]);
                            loadProject();
                            loadRequirements();
                            setAnalyzing(false);
                            setAnalyzing(false);
                            setCurrentAnalysisId(null);
                        } else if (analysis.status === "FAILED") {
                            clearInterval(pollInterval);
                            toast.error(analysis.errorMessage || "Analyse feilet");
                            setAnalyzing(false);
                            setCurrentAnalysisId(null);
                        } else if (analysis.status === "CANCELLED") {
                            clearInterval(pollInterval);
                            toast.info("Analyse avbrutt");
                            setAnalyzing(false);
                            setAnalysisStatus({ stage: "cancelled", message: "Analyse avbrutt" });
                            setCurrentAnalysisId(null);
                        } else {
                            // Still processing - update progress and status
                            setProgress((prev) => Math.min(prev + 5, 95));

                            // Update status info if available
                            if (analysis.currentStage) {
                                setAnalysisStatus({
                                    stage: analysis.currentStage,
                                    message: getStageMessage(analysis.currentStage),
                                    candidatesFound: analysis.candidatesFound,
                                    requirementsValidated: analysis.requirementsValidated,
                                    costNok: analysis.apiCostNok,
                                    activeKeys: analysis.activeKeys,
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error polling analysis status:", err);
                }
            }, 2000);

            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(pollInterval);
                if (analyzing) {
                    toast.error("Analyse tok for lang tid");
                    setAnalyzing(false);
                }
            }, 300000);

        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Analyse feilet");
            setAnalyzing(false);
            setAnalysisStatus(null);
            setCurrentAnalysisId(null);
        }
    };

    const handleCancelAnalysis = async () => {
        if (!currentAnalysisId) return;

        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/analyze/${currentAnalysisId}/cancel`, {
                method: "POST",
            });

            if (!res.ok) throw new Error("Kunne ikke kansellere analyse");

            toast.info("Kansellering sendt...");
        } catch (error) {
            toast.error("Kunne ikke kansellere analyse");
        }
    };

    function getStageMessage(stage: string): string {
        switch (stage) {
            case "extracting": return "Leser innhold fra dokumenter...";
            case "finding": return "Søker etter krav-kandidater med AI...";
            case "validating": return "Validerer og klassifiserer krav...";
            case "assigning": return "Tildeler fagdisipliner...";
            default: return "Behandler...";
        }
    }

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

    // Calculate total API cost for this project
    const totalCostNok = project.analyses.reduce((acc, a) => acc + (a.apiCostNok || 0), 0);

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
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                        {totalCostNok > 0 && (
                            <Badge variant="outline" className="text-xs">
                                API: {totalCostNok.toFixed(2)} NOK
                            </Badge>
                        )}
                    </div>
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
                                <div className="space-y-3">
                                    <Progress value={progress} className="h-2" />
                                    <p className="text-sm text-muted-foreground text-center">
                                        Analyserer dokumenter... {Math.round(progress)}%
                                    </p>
                                    {analysisStatus && (
                                        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <p className="text-sm font-medium text-foreground">
                                                    {analysisStatus.message}
                                                </p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleCancelAnalysis}
                                                    className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <XCircle className="h-4 w-4 mr-1" />
                                                    Avbryt
                                                </Button>
                                            </div>
                                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                                {analysisStatus.candidatesFound !== undefined && (
                                                    <span>Kandidater funnet: <strong>{analysisStatus.candidatesFound}</strong></span>
                                                )}
                                                {analysisStatus.requirementsValidated !== undefined && (
                                                    <span>Validerte krav: <strong>{analysisStatus.requirementsValidated}</strong></span>
                                                )}
                                                {analysisStatus.costNok !== undefined && analysisStatus.costNok > 0 && (
                                                    <span>Kostnad: <strong>{analysisStatus.costNok.toFixed(2)} NOK</strong></span>
                                                )}
                                                {analysisStatus.activeKeys && (
                                                    <span className="flex items-center gap-1">
                                                        <Key className="h-3 w-3" />
                                                        {JSON.parse(analysisStatus.activeKeys).includes("gemini") && <span className="text-green-500">Gemini</span>}
                                                        {JSON.parse(analysisStatus.activeKeys).includes("openai") && <span className="text-green-500 bg-green-500/10 px-1 rounded">OpenAI</span>}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
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
                                                {analysis.apiCostNok > 0 && (
                                                    <div className="flex items-center gap-2 mt-1 text-xs">
                                                        <span className="font-medium bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">
                                                            {analysis.apiCostNok.toFixed(2)} NOK
                                                        </span>
                                                        <span className="text-muted-foreground flex gap-2">
                                                            <span title="Gemini Cost">G: ${analysis.geminiCostUsd?.toFixed(3) ?? "0.000"}</span>
                                                            <span title="OpenAI Cost" className="border-l pl-2">O: ${analysis.openaiCostUsd?.toFixed(3) ?? "0.000"}</span>
                                                        </span>
                                                    </div>
                                                )}
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
                                            {analysis.status === "CANCELLED" && "Avbrutt"}
                                        </Badge>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Requirements Tab */}
                <TabsContent value="requirements" onFocus={() => {
                    if (requirements.length === 0 && !loadingRequirements) {
                        loadRequirements();
                    }
                }}>
                    {loadingRequirements ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : requirements.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <List className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium mb-2">Ingen krav funnet</h3>
                                <p className="text-muted-foreground text-center max-w-md">
                                    Kjør en analyse for å identifisere krav fra dokumentene dine
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <RequirementsTable
                            requirements={requirements}
                            disciplines={project.disciplines}
                            projectId={projectId}
                            onUpdate={loadRequirements}
                        />
                    )}
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
