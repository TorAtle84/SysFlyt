"use client";

import { useState, useMemo } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
    Search,
    Filter,
    Download,
    MoreHorizontal,
    Check,
    X,
    Copy,
    ChevronDown,
    ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Discipline {
    id: string;
    name: string;
    color: string;
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

interface RequirementsTableProps {
    requirements: Requirement[];
    disciplines: Discipline[];
    projectId: string;
    onUpdate: () => void;
}

type SortField = "text" | "score" | "discipline" | "status" | "createdAt";
type SortOrder = "asc" | "desc";

export function RequirementsTable({
    requirements,
    disciplines,
    projectId,
    onUpdate,
}: RequirementsTableProps) {
    const [search, setSearch] = useState("");
    const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<SortField>("createdAt");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

    // Filter and sort requirements
    const filteredRequirements = useMemo(() => {
        let result = requirements;

        // Text search
        if (search) {
            const searchLower = search.toLowerCase();
            result = result.filter(
                (r) =>
                    r.text.toLowerCase().includes(searchLower) ||
                    r.shortText?.toLowerCase().includes(searchLower) ||
                    r.source?.toLowerCase().includes(searchLower)
            );
        }

        // Discipline filter
        if (disciplineFilter !== "all") {
            if (disciplineFilter === "unassigned") {
                result = result.filter((r) => !r.disciplineId);
            } else {
                result = result.filter((r) => r.disciplineId === disciplineFilter);
            }
        }

        // Status filter
        if (statusFilter !== "all") {
            result = result.filter((r) => r.status === statusFilter);
        }

        // Sort
        result = [...result].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case "text":
                    comparison = a.text.localeCompare(b.text);
                    break;
                case "score":
                    comparison = a.score - b.score;
                    break;
                case "discipline":
                    comparison = (a.discipline?.name || "ZZZ").localeCompare(
                        b.discipline?.name || "ZZZ"
                    );
                    break;
                case "status":
                    comparison = a.status.localeCompare(b.status);
                    break;
                case "createdAt":
                    comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [requirements, search, disciplineFilter, statusFilter, sortField, sortOrder]);

    // Count by discipline
    const disciplineCounts = useMemo(() => {
        const counts: Record<string, number> = { unassigned: 0 };
        disciplines.forEach((d) => (counts[d.id] = 0));
        requirements.forEach((r) => {
            if (r.disciplineId) {
                counts[r.disciplineId] = (counts[r.disciplineId] || 0) + 1;
            } else {
                counts.unassigned++;
            }
        });
        return counts;
    }, [requirements, disciplines]);

    // Toggle selection
    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredRequirements.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredRequirements.map((r) => r.id)));
        }
    };

    // Update discipline for selected requirements
    async function updateDiscipline(disciplineId: string | null) {
        if (selectedIds.size === 0) return;

        try {
            const res = await fetch(`/api/flytlink/kravsporing/requirements/bulk`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    disciplineId,
                }),
            });

            if (!res.ok) throw new Error("Oppdatering feilet");

            toast.success(`${selectedIds.size} krav oppdatert`);
            setSelectedIds(new Set());
            onUpdate();
        } catch (error) {
            toast.error("Kunne ikke oppdatere krav");
        }
    }

    // Update status for selected requirements
    async function updateStatus(status: string) {
        if (selectedIds.size === 0) return;

        try {
            const res = await fetch(`/api/flytlink/kravsporing/requirements/bulk`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    status,
                }),
            });

            if (!res.ok) throw new Error("Oppdatering feilet");

            toast.success(`${selectedIds.size} krav oppdatert`);
            setSelectedIds(new Set());
            onUpdate();
        } catch (error) {
            toast.error("Kunne ikke oppdatere krav");
        }
    }

    // Handle sort toggle
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
    };

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Søk i krav..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                    <SelectTrigger className="w-[180px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Alle fag" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alle fag ({requirements.length})</SelectItem>
                        <SelectItem value="unassigned">
                            Ikke tildelt ({disciplineCounts.unassigned})
                        </SelectItem>
                        {disciplines.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: d.color }}
                                    />
                                    {d.name} ({disciplineCounts[d.id] || 0})
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Alle status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alle status</SelectItem>
                        <SelectItem value="ACTIVE">Aktive</SelectItem>
                        <SelectItem value="INACTIVE">Inaktive</SelectItem>
                        <SelectItem value="DUPLICATE">Duplikater</SelectItem>
                    </SelectContent>
                </Select>

                <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Eksporter
                </Button>
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                    <span className="text-sm font-medium">
                        {selectedIds.size} valgt
                    </span>
                    <div className="flex-1" />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Sett fag
                                <ChevronDown className="h-4 w-4 ml-2" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => updateDiscipline(null)}>
                                <X className="h-4 w-4 mr-2" />
                                Fjern fag
                            </DropdownMenuItem>
                            {disciplines.map((d) => (
                                <DropdownMenuItem
                                    key={d.id}
                                    onClick={() => updateDiscipline(d.id)}
                                >
                                    <div
                                        className="h-3 w-3 rounded-full mr-2"
                                        style={{ backgroundColor: d.color }}
                                    />
                                    {d.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Sett status
                                <ChevronDown className="h-4 w-4 ml-2" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => updateStatus("ACTIVE")}>
                                <Check className="h-4 w-4 mr-2 text-green-500" />
                                Aktiv
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateStatus("INACTIVE")}>
                                <X className="h-4 w-4 mr-2 text-red-500" />
                                Inaktiv
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateStatus("DUPLICATE")}>
                                <Copy className="h-4 w-4 mr-2 text-yellow-500" />
                                Duplikat
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                    >
                        Avbryt
                    </Button>
                </div>
            )}

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">
                                <Checkbox
                                    checked={
                                        filteredRequirements.length > 0 &&
                                        selectedIds.size === filteredRequirements.length
                                    }
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => handleSort("text")}
                            >
                                <div className="flex items-center gap-1">
                                    Krav
                                    <ArrowUpDown className="h-4 w-4" />
                                </div>
                            </TableHead>
                            <TableHead
                                className="w-[120px] cursor-pointer hover:bg-muted/50"
                                onClick={() => handleSort("discipline")}
                            >
                                <div className="flex items-center gap-1">
                                    Fag
                                    <ArrowUpDown className="h-4 w-4" />
                                </div>
                            </TableHead>
                            <TableHead
                                className="w-[80px] cursor-pointer hover:bg-muted/50"
                                onClick={() => handleSort("score")}
                            >
                                <div className="flex items-center gap-1">
                                    Score
                                    <ArrowUpDown className="h-4 w-4" />
                                </div>
                            </TableHead>
                            <TableHead
                                className="w-[100px] cursor-pointer hover:bg-muted/50"
                                onClick={() => handleSort("status")}
                            >
                                <div className="flex items-center gap-1">
                                    Status
                                    <ArrowUpDown className="h-4 w-4" />
                                </div>
                            </TableHead>
                            <TableHead className="w-[120px]">Kilde</TableHead>
                            <TableHead className="w-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRequirements.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    {requirements.length === 0
                                        ? "Ingen krav funnet. Kjør en analyse for å identifisere krav."
                                        : "Ingen krav matcher filteret."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRequirements.map((req) => (
                                <TableRow key={req.id} className={cn(selectedIds.has(req.id) && "bg-muted/50")}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedIds.has(req.id)}
                                            onCheckedChange={() => toggleSelect(req.id)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            {req.shortText && (
                                                <p className="font-medium text-sm">{req.shortText}</p>
                                            )}
                                            <p className={cn("text-sm", req.shortText && "text-muted-foreground")}>
                                                {req.text.length > 200 ? req.text.slice(0, 200) + "..." : req.text}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {req.discipline ? (
                                            <Badge
                                                variant="outline"
                                                style={{
                                                    borderColor: req.discipline.color,
                                                    color: req.discipline.color,
                                                }}
                                            >
                                                {req.discipline.name}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className={cn(
                                            "font-medium",
                                            req.score >= 0.8 && "text-green-500",
                                            req.score >= 0.5 && req.score < 0.8 && "text-yellow-500",
                                            req.score < 0.5 && "text-red-500"
                                        )}>
                                            {(req.score * 100).toFixed(0)}%
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                req.status === "ACTIVE"
                                                    ? "default"
                                                    : req.status === "DUPLICATE"
                                                        ? "secondary"
                                                        : "outline"
                                            }
                                        >
                                            {req.status === "ACTIVE" && "Aktiv"}
                                            {req.status === "INACTIVE" && "Inaktiv"}
                                            {req.status === "DUPLICATE" && "Duplikat"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground truncate max-w-[120px]">
                                        {req.source || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>Rediger</DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive">Slett</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                    Viser {filteredRequirements.length} av {requirements.length} krav
                </span>
                <div className="flex items-center gap-4">
                    {disciplines.map((d) => (
                        <div key={d.id} className="flex items-center gap-1">
                            <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: d.color }}
                            />
                            <span>{disciplineCounts[d.id] || 0}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
