"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
    Upload,
    FileText,
    Download,
    Plus,
    Link2,
    Unlink,
    RefreshCcw,
    Clock,
    Loader2,
    Trash2
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface MatrixRow {
    id: string;
    systemCode: string;
    description: string | null;
    sortOrder: number;
    sourceApp: string | null;
    cells: MatrixCell[];
}

interface MatrixColumn {
    id: string;
    discipline: string | null;
    customLabel: string | null;
    color: string;
    sortOrder: number;
}

interface MatrixCell {
    id: string;
    rowId: string;
    columnId: string;
    values: string[];
}

interface Matrix {
    id: string;
    lastSyncedAt: string | null;
    lastSyncedFrom: string | null;
    rows: MatrixRow[];
    columns: MatrixColumn[];
}

interface LinkedProject {
    id: string;
    name: string;
}

interface AvailableProject {
    id: string;
    name: string;
    description: string | null;
}

export default function FlytLinkInterfaceMatrixPage() {
    const params = useParams();
    const projectId = params.projectId as string;

    const [matrix, setMatrix] = useState<Matrix | null>(null);
    const [linkedProject, setLinkedProject] = useState<LinkedProject | null>(null);
    const [availableProjects, setAvailableProjects] = useState<AvailableProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [linking, setLinking] = useState(false);

    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [linkDialogOpen, setLinkDialogOpen] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
    const [selectedProjectToLink, setSelectedProjectToLink] = useState<string>("");

    const fetchMatrix = useCallback(async () => {
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix`);
            if (!res.ok) throw new Error("Kunne ikke laste matrise");
            const data = await res.json();
            setMatrix(data.matrix);
            setLinkedProject(data.linkedProject);
        } catch (error) {
            toast.error("Kunne ikke laste grensesnittmatrise");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    const fetchLinkStatus = useCallback(async () => {
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/link`);
            if (!res.ok) return;
            const data = await res.json();
            setLinkedProject(data.linkedProject);
            setAvailableProjects(data.availableProjects || []);
        } catch (error) {
            console.error("Error fetching link status:", error);
        }
    }, [projectId]);

    useEffect(() => {
        fetchMatrix();
        fetchLinkStatus();
    }, [fetchMatrix, fetchLinkStatus]);

    async function handleImport() {
        if (!selectedFiles || selectedFiles.length === 0) {
            toast.error("Velg minst én fil");
            return;
        }

        setImporting(true);
        try {
            const formData = new FormData();
            for (let i = 0; i < selectedFiles.length; i++) {
                formData.append("files", selectedFiles[i]);
            }

            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Import feilet");
            }

            toast.success(data.message || `La til ${data.createdCount} systemer`);

            if (data.errors && data.errors.length > 0) {
                data.errors.forEach((err: string) => toast.error(err));
            }

            setImportDialogOpen(false);
            setSelectedFiles(null);
            fetchMatrix();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Import feilet");
        } finally {
            setImporting(false);
        }
    }

    async function handleLink() {
        if (!selectedProjectToLink) {
            toast.error("Velg et prosjekt å koble til");
            return;
        }

        setLinking(true);
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sysLinkProjectId: selectedProjectToLink }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Kobling feilet");
            }

            toast.success(data.message || "Prosjektene er koblet");
            setLinkDialogOpen(false);
            setSelectedProjectToLink("");
            fetchMatrix();
            fetchLinkStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Kobling feilet");
        } finally {
            setLinking(false);
        }
    }

    async function handleUnlink() {
        if (!confirm("Er du sikker på at du vil fjerne koblingen?")) return;

        setLinking(true);
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/link`, {
                method: "DELETE",
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Fjerning av kobling feilet");
            }

            toast.success(data.message || "Koblingen er fjernet");
            setLinkedProject(null);
            fetchLinkStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Fjerning feilet");
        } finally {
            setLinking(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Grensesnittmatrise</h1>
                    <p className="text-muted-foreground">
                        Definer ansvarsfordeling mellom systemer og fag
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* Link Status */}
                    {linkedProject ? (
                        <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                            <Link2 className="h-3.5 w-3.5 text-green-500" />
                            Koblet til: {linkedProject.name}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 ml-1 hover:bg-destructive/20"
                                onClick={handleUnlink}
                                disabled={linking}
                            >
                                <Unlink className="h-3 w-3" />
                            </Button>
                        </Badge>
                    ) : (
                        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Link2 className="h-4 w-4 mr-2" />
                                    Koble til SysLink
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Koble til SysLink-prosjekt</DialogTitle>
                                    <DialogDescription>
                                        Velg et SysLink-prosjekt å synkronisere grensesnittmatrisen med
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Label>SysLink-prosjekt</Label>
                                    <Select
                                        value={selectedProjectToLink}
                                        onValueChange={setSelectedProjectToLink}
                                    >
                                        <SelectTrigger className="mt-2">
                                            <SelectValue placeholder="Velg prosjekt..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableProjects.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {availableProjects.length === 0 && (
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Ingen tilgjengelige prosjekter å koble til
                                        </p>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                                        Avbryt
                                    </Button>
                                    <Button
                                        onClick={handleLink}
                                        disabled={!selectedProjectToLink || linking}
                                    >
                                        {linking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Koble prosjekter
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}

                    {/* Import Button */}
                    <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                                <Upload className="h-4 w-4 mr-2" />
                                Importer fra underlag
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Importer systemer fra dokumenter</DialogTitle>
                                <DialogDescription>
                                    Last opp PDF- eller Excel-filer for å hente ut systemkoder (TFM-format)
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Label htmlFor="files">Velg filer</Label>
                                <Input
                                    id="files"
                                    type="file"
                                    multiple
                                    accept=".pdf,.xlsx,.xls,.txt,.csv"
                                    onChange={(e) => setSelectedFiles(e.target.files)}
                                    className="mt-2"
                                />
                                <p className="text-sm text-muted-foreground mt-2">
                                    Støttede formater: PDF, Excel (.xlsx, .xls), Tekst (.txt, .csv)
                                </p>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                                    Avbryt
                                </Button>
                                <Button onClick={handleImport} disabled={importing || !selectedFiles?.length}>
                                    {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Importer
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Sync Status */}
            {matrix?.lastSyncedAt && (
                <Card className="bg-muted/50">
                    <CardContent className="py-3 flex items-center gap-2 text-sm">
                        <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                            Sist synkronisert: Fra {matrix.lastSyncedFrom === "SYSLINK" ? "SysLink" : "FlytLink"},{" "}
                            {format(new Date(matrix.lastSyncedAt), "d. MMM yyyy 'kl.' HH:mm", { locale: nb })}
                        </span>
                    </CardContent>
                </Card>
            )}

            {/* Matrix Table */}
            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    {matrix && matrix.rows.length > 0 ? (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="text-left p-4 font-semibold min-w-[200px]">
                                        System <span className="text-red-500">*</span>
                                    </th>
                                    {matrix.columns.map((col) => (
                                        <th
                                            key={col.id}
                                            className="text-center p-4 font-semibold min-w-[140px]"
                                            style={{ backgroundColor: col.color + "40" }}
                                        >
                                            {col.discipline || col.customLabel}
                                        </th>
                                    ))}
                                    <th className="w-12"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrix.rows.map((row) => (
                                    <tr key={row.id} className="border-b hover:bg-muted/30">
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                {row.sourceApp && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {row.sourceApp === "FLYTLINK" ? "F" : "S"}
                                                    </Badge>
                                                )}
                                                <div>
                                                    <p className="font-mono font-medium">{row.systemCode}</p>
                                                    {row.description && (
                                                        <p className="text-sm text-muted-foreground">{row.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        {matrix.columns.map((col) => {
                                            const cell = row.cells.find((c) => c.columnId === col.id);
                                            const values = (cell?.values as string[]) || [];
                                            return (
                                                <td
                                                    key={col.id}
                                                    className="p-2 text-center"
                                                    style={{ backgroundColor: col.color + "20" }}
                                                >
                                                    <div className="flex flex-wrap gap-1 justify-center">
                                                        {values.map((v, i) => (
                                                            <Badge key={i} variant="secondary" className="text-xs">
                                                                {v}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td className="p-2">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="py-16 text-center">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                            <p className="mt-4 text-lg font-medium">Ingen systemer ennå</p>
                            <p className="text-muted-foreground">
                                Importer systemer fra dokumenter eller koble til et SysLink-prosjekt
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
