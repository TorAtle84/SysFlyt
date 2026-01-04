"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
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
    Plus,
    Link2,
    Unlink,
    RefreshCcw,
    Loader2,
    Trash2,
    CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

const AVAILABLE_TAGS = ["Montasje", "Leveranse", "Merking", "Systemeier", "Delansvarlig", "Kabling og kobling", "Programvareansvarlig"];
const MANDATORY_TAGS = ["Montasje", "Leveranse", "Merking", "Systemeier", "Delansvarlig", "Kabling og kobling"];
const PASTEL_COLORS = [
    "#FCA5A5", "#FDBA74", "#FEF08A", "#86EFAC",
    "#93C5FD", "#C4B5FD", "#F9A8D4", "#E2E8F0",
    "#FEF9C3", "#E9D5FF", "#DCFCE7", "#DBEAFE"
];

interface MatrixRow {
    id: string;
    systemCode: string;
    description: string | null;
    sortOrder: number;
    sourceApp: string | null;
    cells: MatrixCell[];
}

interface MatrixCell {
    id: string;
    columnId: string;
    values: string[];
}

interface MatrixColumn {
    id: string;
    discipline: string | null;
    customLabel: string | null;
    color: string;
    sortOrder: number;
}

interface Matrix {
    id: string;
    rows: MatrixRow[];
    columns: MatrixColumn[];
    lastSyncAt: string | null;
    syncDirection: string | null;
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

interface InterfaceMatrixPanelProps {
    projectId: string;
}

export function InterfaceMatrixPanel({ projectId }: InterfaceMatrixPanelProps) {
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

    // Column adding state
    const [addColumnOpen, setAddColumnOpen] = useState(false);
    const [newColName, setNewColName] = useState("");
    const [newColColor, setNewColColor] = useState(PASTEL_COLORS[0]);

    const fetchMatrix = useCallback(async () => {
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix`);
            if (!res.ok) throw new Error("Kunne ikke laste matrise");
            const data = await res.json();
            setMatrix(data.matrix);
            setLinkedProject(data.linkedProject);
        } catch (error) {
            console.error("Error loading matrix:", error);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    const fetchLinkStatus = useCallback(async () => {
        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/link`);
            if (res.ok) {
                const data = await res.json();
                setAvailableProjects(data.availableProjects || []);
                if (data.linkedProject) {
                    setLinkedProject(data.linkedProject);
                }
            }
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
        const formData = new FormData();
        for (let i = 0; i < selectedFiles.length; i++) {
            formData.append(`file${i}`, selectedFiles[i]);
        }

        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Import feilet");

            toast.success(data.message || "Import fullført");
            setSelectedFiles(null);
            setImportDialogOpen(false);
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
            if (!res.ok) throw new Error(data.error || "Kobling feilet");

            toast.success(data.message || "Prosjektene er koblet");
            setSelectedProjectToLink("");
            setLinkDialogOpen(false);
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
            if (!res.ok) throw new Error(data.error || "Fjerning feilet");

            toast.success(data.message || "Koblingen er fjernet");
            setLinkedProject(null);
            fetchLinkStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Fjerning feilet");
        } finally {
            setLinking(false);
        }
    }

    async function handleAddColumn() {
        if (!newColName.trim()) {
            toast.error("Fagnavn er påkrevd");
            return;
        }

        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix/column`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: newColName, color: newColColor }),
            });

            if (!res.ok) throw new Error("Feilet");
            toast.success("Fag lagt til");
            setNewColName("");
            setAddColumnOpen(false);
            fetchMatrix();
        } catch (error) {
            toast.error("Kunne ikke legge til fag");
        }
    }

    async function handleDeleteRow(rowId: string) {
        if (!confirm("Er du sikker på at du vil slette denne raden?")) return;

        try {
            const res = await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix/row?rowId=${rowId}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Sletting feilet");
            toast.success("Rad slettet");
            fetchMatrix();
        } catch (error) {
            toast.error("Kunne ikke slette rad");
        }
    }

    async function handleUpdateCell(rowId: string, columnId: string, values: string[]) {
        try {
            await fetch(`/api/flytlink/kravsporing/projects/${projectId}/interface-matrix/cell`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rowId, columnId, values }),
            });
        } catch (error) {
            toast.error("Kunne ikke oppdatere celle");
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
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Grensesnittmatrise</CardTitle>

                    <div className="flex flex-wrap gap-2">
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
                                            Velg et SysLink-prosjekt å synkronisere med
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <Select
                                            value={selectedProjectToLink}
                                            onValueChange={setSelectedProjectToLink}
                                        >
                                            <SelectTrigger>
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
                                    </div>
                                    <DialogFooter>
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

                        <Popover open={addColumnOpen} onOpenChange={setAddColumnOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Nytt Fag
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                                <div className="grid gap-4">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">Nytt Fag / Motpart</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Legg til en ny kolonne i matrisen.
                                        </p>
                                    </div>
                                    <div className="grid gap-2">
                                        <div className="grid grid-cols-3 items-center gap-4">
                                            <Label htmlFor="colName">Navn</Label>
                                            <Input
                                                id="colName"
                                                value={newColName}
                                                onChange={(e) => setNewColName(e.target.value)}
                                                className="col-span-2 h-8"
                                                placeholder="F.eks. LÅS"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 items-center gap-4">
                                            <Label>Farge</Label>
                                            <div className="col-span-2 flex flex-wrap gap-1.5">
                                                {PASTEL_COLORS.map(c => (
                                                    <div
                                                        key={c}
                                                        className={cn(
                                                            "w-6 h-6 rounded-full cursor-pointer border-2 transition-all hover:scale-110",
                                                            newColColor === c ? 'border-primary shadow-sm' : 'border-transparent'
                                                        )}
                                                        style={{ backgroundColor: c }}
                                                        onClick={() => setNewColColor(c)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <Button onClick={handleAddColumn} size="sm">Lagre</Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600" size="sm">
                                    <Upload className="h-4 w-4 mr-2" />
                                    Importer
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Importer systemer</DialogTitle>
                                    <DialogDescription>
                                        Last opp filer for å hente ut systemkoder
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
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleImport}
                                        disabled={!selectedFiles?.length || importing}
                                    >
                                        {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Importer
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {matrix?.lastSyncAt && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mt-2">
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Sist synkronisert: Fra {matrix.syncDirection === "FROM_SYSLINK" ? "SysLink" : "FlytLink"},{" "}
                        {format(new Date(matrix.lastSyncAt), "d. MMM yyyy 'kl.' HH:mm", { locale: nb })}
                    </p>
                )}
            </CardHeader>
            <CardContent>
                {matrix && matrix.rows.length > 0 ? (
                    <div className="overflow-x-auto">
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
                                {matrix.rows.map((row) => {
                                    const allTags = new Set<string>();
                                    row.cells.forEach(c => {
                                        (c.values as string[]).forEach(v => allTags.add(v));
                                    });
                                    const isComplete = MANDATORY_TAGS.every(tag => allTags.has(tag));

                                    return (
                                        <tr key={row.id} className="border-b hover:bg-muted/30">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    {isComplete ? (
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                                    ) : (
                                                        <div className="h-4 w-4 rounded-full border border-destructive/50 flex items-center justify-center flex-shrink-0">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                                                        </div>
                                                    )}
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
                                                    <EditableCell
                                                        key={col.id}
                                                        rowId={row.id}
                                                        columnId={col.id}
                                                        values={values}
                                                        color={col.color}
                                                        onUpdate={(newValues) => handleUpdateCell(row.id, col.id, newValues)}
                                                    />
                                                );
                                            })}
                                            <td className="p-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDeleteRow(row.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
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
    );
}

// Editable cell component for tag selection
function EditableCell({
    rowId,
    columnId,
    values,
    color,
    onUpdate
}: {
    rowId: string;
    columnId: string;
    values: string[];
    color: string;
    onUpdate: (newValues: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [localValues, setLocalValues] = useState<string[]>(values);

    function handleToggle(tag: string) {
        const newValues = localValues.includes(tag)
            ? localValues.filter(v => v !== tag)
            : [...localValues, tag];
        setLocalValues(newValues);
    }

    function handleSave() {
        onUpdate(localValues);
        setOpen(false);
    }

    return (
        <td className="p-2 text-center" style={{ backgroundColor: color + "20" }}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        className={cn(
                            "w-full min-h-[40px] rounded-md border border-transparent hover:border-primary/50 transition-colors cursor-pointer p-1",
                            values.length === 0 && "hover:bg-primary/5"
                        )}
                    >
                        <div className="flex flex-wrap gap-1 justify-center">
                            {values.length === 0 ? (
                                <span className="text-xs text-muted-foreground/50">+</span>
                            ) : (
                                values.map((v, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                        {v}
                                    </Badge>
                                ))
                            )}
                        </div>
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-56">
                    <div className="space-y-3">
                        <h4 className="font-medium text-sm">Velg ansvar</h4>
                        <div className="space-y-2">
                            {AVAILABLE_TAGS.map((tag) => (
                                <div key={tag} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`${rowId}-${columnId}-${tag}`}
                                        checked={localValues.includes(tag)}
                                        onCheckedChange={() => handleToggle(tag)}
                                    />
                                    <label
                                        htmlFor={`${rowId}-${columnId}-${tag}`}
                                        className={cn(
                                            "text-sm cursor-pointer",
                                            MANDATORY_TAGS.includes(tag) && "font-medium"
                                        )}
                                    >
                                        {tag}
                                        {MANDATORY_TAGS.includes(tag) && (
                                            <span className="text-destructive ml-0.5">*</span>
                                        )}
                                    </label>
                                </div>
                            ))}
                        </div>
                        <Button onClick={handleSave} size="sm" className="w-full">
                            Lagre
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </td>
    );
}
