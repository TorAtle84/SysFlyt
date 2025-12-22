"use client";

import { useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Upload,
    FileText,
    Download,
    Save,
    History,
    Filter,
    Loader2,
    X,
    CheckCircle,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TfmSegmentConfig {
    byggnr: boolean;
    system: boolean;
    komponent: boolean;
    typekode: boolean;
}

interface ComparisonResult {
    tfm: string;
    sourceDocuments: string[];
    presence: Record<string, boolean>;
}

interface ComparisonData {
    tfmEntries: ComparisonResult[];
    fileNames: string[];
    mainFileName: string;
}

const SEGMENT_COLORS = {
    byggnr: "bg-gray-200 hover:bg-gray-300 border-gray-400",
    system: "bg-blue-100 hover:bg-blue-200 border-blue-400",
    komponent: "bg-orange-100 hover:bg-orange-200 border-orange-400",
    typekode: "bg-purple-100 hover:bg-purple-200 border-purple-400",
};

const SEGMENT_ACTIVE_COLORS = {
    byggnr: "bg-gray-300 border-gray-600 ring-2 ring-gray-400",
    system: "bg-blue-200 border-blue-600 ring-2 ring-blue-400",
    komponent: "bg-orange-200 border-orange-600 ring-2 ring-orange-400",
    typekode: "bg-purple-200 border-purple-600 ring-2 ring-purple-400",
};

export default function ComparisonPage() {
    const params = useParams();
    const projectId = params.projectId as string;

    // State
    const [mode, setMode] = useState<"upload" | "project">("upload");
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [comparisonFiles, setComparisonFiles] = useState<File[]>([]);
    const [segmentConfig, setSegmentConfig] = useState<TfmSegmentConfig>({
        byggnr: false,
        system: true,
        komponent: true,
        typekode: false,
    });
    const [isComparing, setIsComparing] = useState(false);
    const [comparisonResult, setComparisonResult] = useState<ComparisonData | null>(null);
    const [filterText, setFilterText] = useState("");
    const [saveName, setSaveName] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [savedComparisons, setSavedComparisons] = useState<{
        id: string;
        name: string;
        fileUrl: string;
        createdAt: string;
        createdBy: { firstName: string; lastName: string };
    }[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Project mode state
    interface ProjectDocument {
        id: string;
        title: string;
        fileName: string | null;
        type: string;
        url: string;
    }
    const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);
    const [mainDocumentId, setMainDocumentId] = useState<string | null>(null);
    const [comparisonDocumentIds, setComparisonDocumentIds] = useState<string[]>([]);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);

    // Fetch project documents when mode is 'project'
    const fetchProjectDocuments = useCallback(async () => {
        setIsLoadingDocs(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/documents?types=FUNCTION_DESCRIPTION,DRAWING,SCHEMA`);
            if (response.ok) {
                const data = await response.json();
                setProjectDocuments(data.documents || []);
            }
        } catch (error) {
            console.error("Error fetching project documents:", error);
        } finally {
            setIsLoadingDocs(false);
        }
    }, [projectId]);

    // Fetch documents when switching to project mode
    const handleModeChange = (newMode: "upload" | "project") => {
        setMode(newMode);
        setComparisonResult(null);
        if (newMode === "project" && projectDocuments.length === 0) {
            fetchProjectDocuments();
        }
    };

    // Fetch saved comparisons when opening history modal
    const fetchSavedComparisons = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/quality-assurance/comparisons`);
            if (response.ok) {
                const data = await response.json();
                setSavedComparisons(data);
            }
        } catch (error) {
            console.error("Error fetching saved comparisons:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [projectId]);

    // Format date helper
    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("nb-NO", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Toggle segment
    const toggleSegment = (segment: keyof TfmSegmentConfig) => {
        setSegmentConfig((prev) => ({
            ...prev,
            [segment]: !prev[segment],
        }));
    };

    // Handle main file upload
    const handleMainFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setMainFile(file);
            setComparisonResult(null);
        }
    };

    // Handle comparison files upload
    const handleComparisonFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setComparisonFiles(files);
        setComparisonResult(null);
    };

    // Remove main file
    const removeMainFile = () => {
        setMainFile(null);
        setComparisonResult(null);
    };

    // Remove comparison file
    const removeComparisonFile = (index: number) => {
        setComparisonFiles((prev) => prev.filter((_, i) => i !== index));
        setComparisonResult(null);
    };

    // Run comparison
    const runComparison = async () => {
        if (!mainFile || comparisonFiles.length === 0) return;

        setIsComparing(true);
        try {
            const formData = new FormData();
            formData.append("mainFile", mainFile);
            comparisonFiles.forEach((file) => {
                formData.append("comparisonFiles", file);
            });
            formData.append("segmentConfig", JSON.stringify(segmentConfig));

            const response = await fetch(`/api/projects/${projectId}/quality-assurance/compare`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("Comparison failed");
            }

            const data = await response.json();
            setComparisonResult(data);
        } catch (error) {
            console.error("Comparison error:", error);
            alert("Kunne ikke utføre sammenligning");
        } finally {
            setIsComparing(false);
        }
    };

    // Run project comparison (using project documents)
    const runProjectComparison = async () => {
        if (!mainDocumentId || comparisonDocumentIds.length === 0) return;

        setIsComparing(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/quality-assurance/compare`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mainDocumentId,
                    comparisonDocumentIds,
                    segmentConfig,
                }),
            });

            if (!response.ok) {
                throw new Error("Comparison failed");
            }

            const data = await response.json();
            setComparisonResult(data);
        } catch (error) {
            console.error("Project comparison error:", error);
            alert("Kunne ikke utføre sammenligning");
        } finally {
            setIsComparing(false);
        }
    };

    // Export to Excel
    const exportToExcel = async () => {
        if (!comparisonResult) return;

        try {
            const response = await fetch(`/api/projects/${projectId}/quality-assurance/compare/export`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comparison: comparisonResult,
                    name: saveName || "Sammenligning",
                }),
            });

            if (!response.ok) throw new Error("Export failed");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${saveName || "sammenligning"}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export error:", error);
            alert("Kunne ikke eksportere til Excel");
        }
    };

    // Save to project
    const saveToProject = async () => {
        if (!comparisonResult || !saveName.trim()) return;

        setIsSaving(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/quality-assurance/comparisons`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: saveName,
                    comparison: comparisonResult,
                    segmentConfig,
                }),
            });

            if (!response.ok) throw new Error("Save failed");

            setShowSaveModal(false);
            setSaveName("");
            alert("Sammenligning lagret!");
        } catch (error) {
            console.error("Save error:", error);
            alert("Kunne ikke lagre sammenligning");
        } finally {
            setIsSaving(false);
        }
    };

    // Filtered results
    const filteredResults = useMemo(() => {
        if (!comparisonResult) return [];
        const search = filterText.toLowerCase();
        return comparisonResult.tfmEntries.filter(
            (entry) =>
                entry.tfm.toLowerCase().includes(search) ||
                entry.sourceDocuments.some((d) => d.toLowerCase().includes(search))
        );
    }, [comparisonResult, filterText]);

    // Active segments display
    const activeSegments = Object.entries(segmentConfig)
        .filter(([, active]) => active)
        .map(([key]) => key.toUpperCase())
        .join(" : ");

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Sammenligning</h1>
                    <p className="text-muted-foreground">
                        Sammenlign TFM-oppføringer på tvers av dokumenter
                    </p>
                </div>
                <Button variant="outline" onClick={() => setShowHistoryModal(true)}>
                    <History className="w-4 h-4 mr-2" />
                    Se sammenligninger
                </Button>
            </div>

            {/* Mode Selector */}
            <Tabs value={mode} onValueChange={(v) => handleModeChange(v as "upload" | "project")}>
                <TabsList>
                    <TabsTrigger value="upload">Opplasting</TabsTrigger>
                    <TabsTrigger value="project">Prosjekt</TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="space-y-4">
                    {/* File Uploads */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Main File */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Hovedfil</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {mainFile ? (
                                    <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            <span className="text-sm truncate">{mainFile.name}</span>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={removeMainFile}>
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Label className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                        <span className="text-sm text-muted-foreground">
                                            Klikk for å laste opp hovedfil
                                        </span>
                                        <Input
                                            type="file"
                                            accept=".pdf,.docx,.doc,.xlsx,.xls"
                                            className="hidden"
                                            onChange={handleMainFileChange}
                                        />
                                    </Label>
                                )}
                            </CardContent>
                        </Card>

                        {/* Comparison Files */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Sammenligningsfiler</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {comparisonFiles.length > 0 ? (
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {comparisonFiles.map((file, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between p-2 bg-muted rounded-md"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <FileText className="w-4 h-4" />
                                                    <span className="text-sm truncate">{file.name}</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeComparisonFile(index)}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <Label className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                                    <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                                    <span className="text-sm text-muted-foreground">
                                        Klikk for å laste opp flere filer
                                    </span>
                                    <Input
                                        type="file"
                                        accept=".pdf,.docx,.doc,.xlsx,.xls"
                                        className="hidden"
                                        multiple
                                        onChange={handleComparisonFilesChange}
                                    />
                                </Label>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="project" className="space-y-4">
                    {isLoadingDocs ? (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-center py-8 gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="text-muted-foreground">Laster dokumenter...</span>
                                </div>
                            </CardContent>
                        </Card>
                    ) : projectDocuments.length === 0 ? (
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground text-center py-8">
                                    Ingen dokumenter funnet i Underlag. Last opp dokumenter under Funksjonsbeskrivelser, Arbeidstegninger eller Systemskjema først.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            {/* Main Document Selection */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Hovedfil</CardTitle>
                                    <p className="text-sm text-muted-foreground">Velg ett dokument som hovedfil</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {projectDocuments.map((doc) => (
                                            <label
                                                key={doc.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all",
                                                    mainDocumentId === doc.id
                                                        ? "bg-blue-100 border border-blue-400"
                                                        : "bg-muted hover:bg-muted/80"
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="mainDocument"
                                                    checked={mainDocumentId === doc.id}
                                                    onChange={() => {
                                                        setMainDocumentId(doc.id);
                                                        setComparisonResult(null);
                                                    }}
                                                    className="h-4 w-4"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{doc.title}</p>
                                                    <p className="text-xs text-muted-foreground">{doc.type === "FUNCTION_DESCRIPTION" ? "Funksjonsbeskrivelse" : doc.type === "DRAWING" ? "Arbeidstegning" : "Systemskjema"}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Comparison Documents Selection */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Sammenligningsfiler</CardTitle>
                                    <p className="text-sm text-muted-foreground">Velg dokumenter å sammenligne med</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {projectDocuments.filter(d => d.id !== mainDocumentId).map((doc) => (
                                            <label
                                                key={doc.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all",
                                                    comparisonDocumentIds.includes(doc.id)
                                                        ? "bg-orange-100 border border-orange-400"
                                                        : "bg-muted hover:bg-muted/80"
                                                )}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={comparisonDocumentIds.includes(doc.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setComparisonDocumentIds(prev => [...prev, doc.id]);
                                                        } else {
                                                            setComparisonDocumentIds(prev => prev.filter(id => id !== doc.id));
                                                        }
                                                        setComparisonResult(null);
                                                    }}
                                                    className="h-4 w-4"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{doc.title}</p>
                                                    <p className="text-xs text-muted-foreground">{doc.type === "FUNCTION_DESCRIPTION" ? "Funksjonsbeskrivelse" : doc.type === "DRAWING" ? "Arbeidstegning" : "Systemskjema"}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {comparisonDocumentIds.length > 0 && (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {comparisonDocumentIds.length} dokument(er) valgt
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* TFM Segment Selector */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">TFM Segmentering</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Velg hvilke segmenter som skal sammenlignes
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {(Object.keys(segmentConfig) as Array<keyof TfmSegmentConfig>).map((segment) => (
                            <button
                                key={segment}
                                onClick={() => toggleSegment(segment)}
                                className={cn(
                                    "px-4 py-2 rounded-lg border-2 font-medium transition-all",
                                    segmentConfig[segment]
                                        ? SEGMENT_ACTIVE_COLORS[segment]
                                        : SEGMENT_COLORS[segment]
                                )}
                            >
                                {segment.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    {activeSegments && (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Valgt segmentering: <strong>{activeSegments}</strong>
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Run Comparison Button */}
            {((mode === "upload" && mainFile && comparisonFiles.length > 0) ||
                (mode === "project" && mainDocumentId && comparisonDocumentIds.length > 0)) && (
                    <div className="flex justify-center">
                        <Button
                            size="lg"
                            onClick={mode === "upload" ? runComparison : runProjectComparison}
                            disabled={isComparing || Object.values(segmentConfig).every((v) => !v)}
                        >
                            {isComparing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sammenligner...
                                </>
                            ) : (
                                "Start sammenligning"
                            )}
                        </Button>
                    </div>
                )}

            {/* Results Table */}
            {comparisonResult && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Resultat</CardTitle>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Filtrer..."
                                        value={filterText}
                                        onChange={(e) => setFilterText(e.target.value)}
                                        className="pl-9 w-60"
                                    />
                                </div>
                                <Button variant="outline" onClick={exportToExcel}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Eksporter
                                </Button>
                                <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
                                    <DialogTrigger asChild>
                                        <Button>
                                            <Save className="w-4 h-4 mr-2" />
                                            Lagre i prosjekt
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Lagre sammenligning</DialogTitle>
                                            <DialogDescription>
                                                Gi sammenligningen et navn for å lagre den i prosjektet.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="name">Navn</Label>
                                                <Input
                                                    id="name"
                                                    placeholder="F.eks. Masseliste vs Tegninger Q4"
                                                    value={saveName}
                                                    onChange={(e) => setSaveName(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" onClick={() => setShowSaveModal(false)}>
                                                    Avbryt
                                                </Button>
                                                <Button onClick={saveToProject} disabled={isSaving || !saveName.trim()}>
                                                    {isSaving ? (
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    ) : null}
                                                    Lagre
                                                </Button>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[150px]">TFM</TableHead>
                                        <TableHead className="min-w-[200px]">Kilder</TableHead>
                                        {comparisonResult.fileNames.map((fileName) => (
                                            <TableHead key={fileName} className="min-w-[150px]">
                                                {fileName}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResults.map((entry, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-mono text-sm">{entry.tfm}</TableCell>
                                            <TableCell className="text-sm">
                                                {entry.sourceDocuments.map((doc, i) => (
                                                    <div key={i} className="truncate">
                                                        {doc}
                                                    </div>
                                                ))}
                                            </TableCell>
                                            {comparisonResult.fileNames.map((fileName) => {
                                                const isPresent = entry.presence[fileName];
                                                return (
                                                    <TableCell
                                                        key={fileName}
                                                        className={cn(
                                                            "text-center font-medium",
                                                            isPresent ? "bg-green-100" : "bg-red-100"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            {isPresent ? (
                                                                <>
                                                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                                                    <span className="text-green-700">Tilstede</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <XCircle className="w-4 h-4 text-red-600" />
                                                                    <span className="text-red-700">Mangler</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Viser {filteredResults.length} av {comparisonResult.tfmEntries.length} oppføringer
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* History Modal */}
            <Dialog
                open={showHistoryModal}
                onOpenChange={(open) => {
                    setShowHistoryModal(open);
                    if (open) fetchSavedComparisons();
                }}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Lagrede sammenligninger</DialogTitle>
                        <DialogDescription>
                            Tidligere lagrede sammenligninger for dette prosjektet.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {isLoadingHistory ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : savedComparisons.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                Ingen lagrede sammenligninger ennå.
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                {savedComparisons.map((comparison) => (
                                    <div
                                        key={comparison.id}
                                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                                    >
                                        <div className="flex-1">
                                            <p className="font-medium">{comparison.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {comparison.createdBy.firstName} {comparison.createdBy.lastName} • {formatDate(comparison.createdAt)}
                                            </p>
                                        </div>
                                        <a
                                            href={comparison.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                                        >
                                            <Download className="w-4 h-4" />
                                            Last ned
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
