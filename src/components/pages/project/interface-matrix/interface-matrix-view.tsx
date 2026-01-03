"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowDownToLine, Pencil, CheckCircle2, XCircle, FileDown, Plus, Trash2, MoreHorizontal, Info } from "lucide-react";
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
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

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
    if (!data) return <div className="p-8 text-muted-foreground">Ingen data funnet.</div>;

    const sortedRows = [...data.rows].sort((a, b) => a.systemCode.localeCompare(b.systemCode, undefined, { numeric: true }));

    return (
        <TooltipProvider>
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-2 border-b">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Grensesnittmatrise</h1>
                        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
                            Definer ansvarsfordeling mellom systemer og fag. Systemkoder hentes fra MC-protokollene.
                        </p>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                        <Popover open={isAddingCol} onOpenChange={setIsAddingCol}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Nytt Fag
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                                <div className="grid gap-4">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">Nytt Fag / Motpart</h4>
                                        <p className="text-sm text-muted-foreground">Legg til en ny kolonne i matrisen.</p>
                                    </div>
                                    <div className="grid gap-2">
                                        <div className="grid grid-cols-3 items-center gap-4">
                                            <Label htmlFor="name">Navn</Label>
                                            <Input
                                                id="name"
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

                        <Button variant="outline" size="sm" className="h-9" onClick={handleExport}>
                            <FileDown className="mr-2 h-4 w-4" />
                            PDF
                        </Button>
                        <Button onClick={handleImport} disabled={isImporting} size="sm" className="h-9">
                            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}
                            Importer fra MC
                        </Button>
                    </div>
                </div>

                {/* Matrix Table */}
                <Card className="overflow-hidden border shadow-sm bg-card">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-b hover:bg-transparent">
                                    <TableHead className="w-[300px] min-w-[300px] border-r bg-card sticky left-0 z-20">
                                        <span className="font-semibold text-foreground px-2 flex items-center gap-1">
                                            System
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="text-destructive font-bold text-lg cursor-help leading-none pt-1">*</span>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                    <p>Rød stjerne (*) indikerer ansvar som <strong>må</strong> fylles ut for at systemet skal regnes som komplett.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </span>
                                    </TableHead>
                                    {data.columns.map((col) => (
                                        <TableHead
                                            key={col.id}
                                            className="text-center min-w-[180px] border-r px-0 py-0 h-auto"
                                        >
                                            <div
                                                className="w-full h-full py-3 px-2 flex items-center justify-center font-bold text-sm tracking-wide shadow-sm"
                                                style={{ backgroundColor: col.color, color: "#1a1a1a" }}
                                            >
                                                {col.discipline || col.customLabel}
                                            </div>
                                        </TableHead>
                                    ))}
                                    <TableHead className="w-[60px] min-w-[60px] bg-card sticky right-0 z-20"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={data.columns.length + 2} className="h-32 text-center text-muted-foreground">
                                            Ingen systemer lagt til. Klikk "Importer fra MC" for å starte.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedRows.map((row) => (
                                        <MatrixRowItem
                                            key={row.id}
                                            row={row}
                                            columns={data.columns}
                                            projectId={projectId}
                                            onDelete={() => handleDeleteRow(row.id)}
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            </div>
        </TooltipProvider>
    );
}

function MatrixRowItem({ row, columns, projectId, onDelete }: { row: MatrixRow; columns: MatrixColumn[], projectId: string, onDelete: () => void }) {
    const [description, setDescription] = useState(row.description || "");
    const [isEditing, setIsEditing] = useState(false);

    // Lift cell values state to row level for real-time status calculation
    const [cellValuesMap, setCellValuesMap] = useState<Record<string, string[]>>(() => {
        const map: Record<string, string[]> = {};
        row.cells.forEach(c => {
            map[c.columnId] = Array.isArray(c.values) ? c.values : [];
        });
        return map;
    });

    // Calculate completion based on current cell values state
    const isComplete = useMemo(() => {
        const presentTags = new Set<string>();
        Object.values(cellValuesMap).forEach(values => {
            values.forEach(v => presentTags.add(v));
        });
        return MANDATORY_TAGS.every(tag => presentTags.has(tag));
    }, [cellValuesMap]);

    function handleCellValuesChange(columnId: string, newValues: string[]) {
        setCellValuesMap(prev => ({ ...prev, [columnId]: newValues }));
    }

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
        <TableRow className="group border-b hover:bg-muted/30 transition-colors">
            {/* System Column - Sticky */}
            <TableCell className="sticky left-0 z-10 bg-card border-r align-top p-0 transition-colors">
                <div className="flex flex-col h-full min-h-[60px] p-4 relative">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-mono font-semibold text-base tracking-tight text-foreground">
                            {row.systemCode}
                        </span>
                        <div title={isComplete ? "Alle krav oppfylt" : "Mangler påkrevde felt"}>
                            {isComplete ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <div className="h-4 w-4 rounded-full border border-destructive/50 flex items-center justify-center">
                                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Description Edit */}
                    <div className="flex-1 mt-1">
                        {isEditing ? (
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onBlur={saveDescription}
                                onKeyDown={(e) => e.key === 'Enter' && saveDescription()}
                                autoFocus
                                className="h-7 text-sm px-2 bg-background z-20 relative"
                            />
                        ) : (
                            <div
                                className="group/desc text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center gap-2"
                                onClick={() => setIsEditing(true)}
                            >
                                <span className="line-clamp-2 leading-snug">
                                    {description || <span className="italic opacity-50">Legg til beskrivelse...</span>}
                                </span>
                                <Pencil className="h-3 w-3 opacity-0 group-hover/desc:opacity-50 transition-opacity" />
                            </div>
                        )}
                    </div>
                </div>
                {/* Colored Accent Line on Left */}
                <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1",
                    isComplete ? "bg-emerald-500/50" : "bg-destructive/30"
                )} />
            </TableCell>

            {/* Dynamic Columns */}
            {columns.map(col => {
                return (
                    <MatrixCellItem
                        key={col.id}
                        rowId={row.id}
                        columnId={col.id}
                        values={cellValuesMap[col.id] || []}
                        onValuesChange={(newValues) => handleCellValuesChange(col.id, newValues)}
                        color={col.color}
                        projectId={projectId}
                    />
                );
            })}

            {/* Delete Action Column */}
            <TableCell className="sticky right-0 z-10 bg-card p-2 align-middle text-center transition-colors">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-70 hover:opacity-100 transition-all duration-200"
                    onClick={onDelete}
                    title="Slett system"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

function MatrixCellItem({ rowId, columnId, values, onValuesChange, color, projectId }: { rowId: string, columnId: string, values: string[], onValuesChange: (newValues: string[]) => void, color: string, projectId: string }) {
    const [open, setOpen] = useState(false);

    async function handleValueChange(tag: string, checked: boolean) {
        let newValues = [...values];
        if (checked) {
            if (!newValues.includes(tag)) newValues.push(tag);
        } else {
            newValues = newValues.filter(v => v !== tag);
        }
        onValuesChange(newValues);

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

    const hasValues = values.length > 0;

    return (
        <TableCell className="p-0 border-r align-top h-full relative">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        className={cn(
                            "w-full h-full min-h-[60px] p-2 flex flex-col items-start justify-start gap-1.5 transition-all outline-none focus-visible:bg-muted/50 text-left relative",
                            !hasValues && "hover:bg-muted/30 group/cell"
                        )}
                        type="button"
                    >
                        {hasValues ? (
                            <div className="flex flex-wrap gap-1.5 w-full">
                                {values.map(v => (
                                    <Badge
                                        key={v}
                                        variant="outline"
                                        className="text-xs px-2.5 py-1 font-medium border-0 shadow-sm leading-tight !text-black"
                                        style={{ backgroundColor: color }}
                                    >
                                        {v}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            // Empty State - Hidden Plus Icon
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <Plus className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                        )}
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 shadow-lg border-border" align="center" sideOffset={5}>
                    <div
                        className="p-3 border-b"
                        style={{ backgroundColor: color }}
                    >
                        <h4 className="font-semibold text-sm text-neutral-900">Velg ansvar</h4>
                        <p className="text-[11px] text-neutral-800/80 mt-0.5">Merk av gjeldende punkter</p>
                    </div>

                    <Command>
                        <CommandInput placeholder="Søk i tags..." className="h-9" />
                        <CommandList>
                            <CommandEmpty>Ingen treff.</CommandEmpty>
                            <CommandGroup className="max-h-[260px] overflow-auto">
                                {AVAILABLE_TAGS.map(tag => {
                                    const isSelected = values.includes(tag);
                                    const isMandatory = MANDATORY_TAGS.includes(tag);
                                    return (
                                        <CommandItem
                                            key={tag}
                                            onSelect={() => handleValueChange(tag, !isSelected)}
                                            className="flex items-center gap-2 cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => handleValueChange(tag, !isSelected)}
                                                className="border-muted-foreground/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                            />
                                            <span className="flex-1">{tag}</span>
                                            {isMandatory && (
                                                <span className="text-[14px] text-destructive leading-none font-bold pt-1">*</span>
                                            )}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </TableCell>
    );
}

