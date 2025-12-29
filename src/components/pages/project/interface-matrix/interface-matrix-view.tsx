"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowDownToLine, Pencil, CheckCircle2, XCircle, FileDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type MatrixData = {
    id: string;
    rows: MatrixRow[];
    columns: MatrixColumn[];
};

type MatrixRow = {
    id: string;
    matrixId: string;
    systemCode: string;
    description: string | null;
    sortOrder: number;
    cells: MatrixCell[];
};

type MatrixColumn = {
    id: string;
    matrixId: string;
    discipline: string | null;
    customLabel: string | null;
    color: string;
    sortOrder: number;
};

type MatrixCell = {
    id: string;
    rowId: string;
    columnId: string;
    values: string[];
};

const MANDATORY_TAGS = ["Montasje", "Leveranse", "Merking", "Systemeier", "Delansvarlig", "Kabling og kobling"];
const AVAILABLE_TAGS = [...MANDATORY_TAGS, "Programvareansvarlig"];

function isRowComplete(row: MatrixRow) {
    const presentTags = new Set<string>();
    row.cells.forEach(c => {
        if (Array.isArray(c.values)) {
            c.values.forEach(v => presentTags.add(v as string));
        }
    });
    const missingTags = MANDATORY_TAGS.filter(tag => !presentTags.has(tag));
    return missingTags.length === 0;
}

const PASTEL_COLORS = [
    "#FCA5A5", "#FDBA74", "#FEF08A", "#86EFAC",
    "#93C5FD", "#C4B5FD", "#F9A8D4", "#E2E8F0",
    "#FEF9C3", "#E9D5FF", "#DCFCE7", "#DBEAFE"
];

export function InterfaceMatrixView() {
    const params = useParams();
    const projectId = params.projectId as string;

    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [data, setData] = useState<MatrixData | null>(null);

    // Add Column State
    const [isAddingCol, setIsAddingCol] = useState(false);
    const [newColName, setNewColName] = useState("");
    const [newColColor, setNewColColor] = useState(PASTEL_COLORS[0]);

    useEffect(() => {
        fetchMatrix();
    }, [projectId]);

    async function fetchMatrix() {
        try {
            const res = await fetch(`/api/projects/${projectId}/interface-matrix`);
            if (!res.ok) throw new Error("Failed to fetch matrix");
            const json = await res.json();
            setData(json.matrix);
        } catch (error) {
            toast.error("Kunne ikke laste grensesnittmatrise");
        } finally {
            setIsLoading(false);
        }
    }

    async function handleImport() {
        setIsImporting(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/interface-matrix`, {
                method: "POST",
            });
            if (!res.ok) throw new Error("Import failed");
            const json = await res.json();

            if (json.createdCount === 0) {
                toast.info(json.message || "Ingen nye systemer å importere");
            } else {
                toast.success(json.message);
                await fetchMatrix();
            }
        } catch (error) {
            toast.error("Import feilet");
        } finally {
            setIsImporting(false);
        }
    }

    function handleExport() {
        if (!data) return;
        const hasErrors = data.rows.some(r => !isRowComplete(r));
        if (hasErrors) {
            if (!confirm("Noen systemer mangler påkrevde grensesnitt (Rødt Kryss). Vil du likevel eksportere til PDF?")) {
                return;
            }
        }
        window.open(`/api/projects/${projectId}/interface-matrix/export`, '_blank');
    }

    async function handleAddColumn() {
        if (!newColName) {
            toast.error("Vennligst oppgi navn");
            return;
        }
        try {
            const res = await fetch(`/api/projects/${projectId}/interface-matrix/column`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: newColName, color: newColColor }),
            });
            if (!res.ok) throw new Error("Failed");

            toast.success("Fag lagt til");
            setNewColName("");
            setIsAddingCol(false);
            await fetchMatrix();
        } catch (e) {
            toast.error("Kunne ikke legge til fag");
        }
    }

    async function handleDeleteRow(rowId: string) {
        if (!confirm("Er du sikker på at du vil slette denne raden?")) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/interface-matrix/row?rowId=${rowId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Delete failed");
            toast.success("Rad slettet");
            await fetchMatrix();
        } catch (e) {
            toast.error("Kunne ikke slette rad");
        }
    }

    if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>;
    if (!data) return <div className="p-8 text-black">Ingen data funnet.</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Grensesnittmatrise</h1>
                    <p className="text-muted-foreground">Oversikt over ansvarsfordeling per system og fag.</p>
                </div>
                <div className="flex gap-2 items-center">
                    <Popover open={isAddingCol} onOpenChange={setIsAddingCol}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Plus className="mr-2 h-4 w-4" />
                                Legg til fag
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-medium leading-none text-black">Nytt Fag / Motpart</h4>
                                    <p className="text-sm text-gray-500">Legg til en ny kolonne i matrisen.</p>
                                </div>
                                <div className="grid gap-2">
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label htmlFor="name" className="text-black">Navn</Label>
                                        <Input
                                            id="name"
                                            value={newColName}
                                            onChange={(e) => setNewColName(e.target.value)}
                                            className="col-span-2 h-8"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label className="text-black">Farge</Label>
                                        <div className="col-span-2 flex flex-wrap gap-1">
                                            {PASTEL_COLORS.map(c => (
                                                <div
                                                    key={c}
                                                    className={`w-6 h-6 rounded-full cursor-pointer border-2 ${newColColor === c ? 'border-primary' : 'border-transparent'}`}
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

                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <FileDown className="mr-2 h-4 w-4" />
                        Eksporter PDF
                    </Button>
                    <Button onClick={handleImport} disabled={isImporting} size="sm">
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}
                        Importer systemer
                    </Button>
                </div>
            </div>

            <div className="border rounded-lg overflow-x-auto bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[300px] min-w-[200px] font-semibold text-foreground border-r sticky left-0 z-20 bg-muted/50">
                                System
                            </TableHead>
                            {data.columns.map((col) => (
                                <TableHead
                                    key={col.id}
                                    className="text-center min-w-[200px] border-r font-semibold text-foreground px-2"
                                    style={{ backgroundColor: col.color }}
                                >
                                    {col.discipline || col.customLabel}
                                </TableHead>
                            ))}
                            <TableHead className="w-[60px] min-w-[60px] text-center font-semibold text-foreground sticky right-0 z-20 bg-muted/50">
                                Slett
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.rows.map((row) => (
                            <MatrixRowItem
                                key={row.id}
                                row={row}
                                columns={data.columns}
                                projectId={projectId}
                                onDelete={() => handleDeleteRow(row.id)}
                            />
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function MatrixRowItem({ row, columns, projectId, onDelete }: { row: MatrixRow; columns: MatrixColumn[], projectId: string, onDelete: () => void }) {
    const [description, setDescription] = useState(row.description || "");
    const [isEditing, setIsEditing] = useState(false);
    const isComplete = isRowComplete(row);

    async function saveDescription() {
        setIsEditing(false);
        if (description === row.description) return;

        try {
            await fetch(`/api/projects/${projectId}/interface-matrix/row`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rowId: row.id, description }),
            });
            toast.success("Beskrivelse lagret");
        } catch (e) {
            toast.error("Kunne ikke lagre beskrivelse");
        }
    }

    return (
        <TableRow className="group">
            <TableCell className="sticky left-0 z-10 bg-background border-r align-top p-3 font-medium">
                <div className="flex items-start justify-between h-full min-h-[44px]">
                    <div className="flex flex-col gap-1 w-full mr-3">
                        <span className="text-sm font-semibold">{row.systemCode}</span>
                        <div className="flex items-center text-xs text-muted-foreground min-h-[20px]">
                            {isEditing ? (
                                <Input
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    onBlur={saveDescription}
                                    onKeyDown={(e) => e.key === 'Enter' && saveDescription()}
                                    autoFocus
                                    className="h-6 text-xs px-1 border-input"
                                />
                            ) : (
                                <div
                                    className="group/desc flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded -ml-1 pl-1 pr-2 py-0.5 transition-colors"
                                    onClick={() => setIsEditing(true)}
                                >
                                    <span className="truncate max-w-[200px]" title={description || ""}>
                                        {description || "Legg til beskrivelse"}
                                    </span>
                                    <Pencil className="h-3 w-3 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>
                    </div>
                    <div title={isComplete ? "Komplett" : "Mangler påkrevde grensesnitt"}>
                        {isComplete ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-1" />
                        ) : (
                            <XCircle className="h-5 w-5 text-red-500 mt-1" />
                        )}
                    </div>
                </div>
            </TableCell>
            {columns.map(col => {
                const cell = row.cells.find(c => c.columnId === col.id);
                return (
                    <MatrixCellItem
                        key={col.id}
                        rowId={row.id}
                        columnId={col.id}
                        initialValues={cell?.values as string[] || []}
                        color={col.color}
                        projectId={projectId}
                    />
                );
            })}
            <TableCell className="sticky right-0 z-10 bg-background text-center align-middle p-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    onClick={onDelete}
                    title="Slett rad"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

function MatrixCellItem({ rowId, columnId, initialValues, color, projectId }: { rowId: string, columnId: string, initialValues: string[], color: string, projectId: string }) {
    const [values, setValues] = useState<string[]>(initialValues);
    const [open, setOpen] = useState(false);

    async function handleValueChange(tag: string, checked: boolean) {
        let newValues = [...values];
        if (checked) {
            if (!newValues.includes(tag)) newValues.push(tag);
        } else {
            newValues = newValues.filter(v => v !== tag);
        }
        setValues(newValues);

        try {
            await fetch(`/api/projects/${projectId}/interface-matrix/cell`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rowId, columnId, values: newValues }),
            });
        } catch (e) {
            toast.error("Lagring feilet");
        }
    }

    return (
        <TableCell className="p-2 border-r align-top text-center">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        className={cn(
                            "w-full min-h-[44px] px-2 py-1.5 flex flex-col items-center justify-center gap-1.5 rounded-md transition-all border",
                            values.length > 0
                                ? "bg-background border-transparent hover:border-input shadow-sm"
                                : "bg-transparent border-transparent hover:bg-muted/50 hover:border-border/50 text-muted-foreground"
                        )}
                        type="button"
                    >
                        {values.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-center w-full">
                                {values.map(v => (
                                    <span
                                        key={v}
                                        className="text-[10px] px-2 py-0.5 rounded-full border font-medium text-foreground bg-background shadow-sm whitespace-nowrap"
                                        style={{ backgroundColor: color, borderColor: color }}
                                    >
                                        {v}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-xs opacity-50 font-normal">Velg...</span>
                        )}
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="center">
                    <div
                        className="p-3 border-b flex items-center justify-between"
                        style={{ backgroundColor: color }}
                    >
                        <div>
                            <h4 className="font-semibold text-sm text-foreground">Velg ansvar</h4>
                            <p className="text-[10px] text-foreground/70">Klikk for å endre</p>
                        </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5">
                        {AVAILABLE_TAGS.map(tag => {
                            const isSelected = values.includes(tag);
                            const isMandatory = MANDATORY_TAGS.includes(tag);
                            return (
                                <div
                                    key={tag}
                                    className={cn(
                                        "flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors text-sm",
                                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                                    )}
                                    onClick={() => handleValueChange(tag, !isSelected)}
                                >
                                    <Checkbox
                                        id={`c-${rowId}-${columnId}-${tag}`}
                                        checked={isSelected}
                                        onCheckedChange={(c) => handleValueChange(tag, c as boolean)}
                                        className="border-muted-foreground/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary" // Better contrast
                                    />
                                    <Label
                                        htmlFor={`c-${rowId}-${columnId}-${tag}`}
                                        className="pointer-events-none flex-1 flex items-center justify-between"
                                    >
                                        <span>{tag}</span>
                                        {isMandatory && <span className="text-red-500 text-xs font-bold" title="Påkrevd">*</span>}
                                    </Label>
                                </div>
                            );
                        })}
                    </div>
                </PopoverContent>
            </Popover>
        </TableCell>
    );
}
