"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
    ChevronLeft,
    ChevronDown,
    MapPin,
    Upload,
    FileText,
    FileDown,
    Box,
    X,
    Loader2,
    Camera,
    MessageCircle,
    Folder,
    Trash2,
    Calendar as CalendarIcon,
    Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NotesModal } from "@/components/mc/notes-modal";
import { PhotoCaptureModal } from "@/components/mc/photo-capture-modal";
import { FDVModal } from "@/components/mc/fdv-modal";
import { SendEmailModal } from "@/components/email/send-email-modal";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CommentThread } from "./comment-thread";
import { LocationModal } from "./location-modal";
import { DocumentViewerModal } from "./document-viewer-modal";
import { ModelViewerModal } from "@/components/pages/project/models/model-viewer-modal";

interface ProtocolDetailProps {
    project: { id: string; name: string };
    protocol: any;
    members: any[];
    userId: string;
}

type StatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NA" | "DEVIATION";

const DISCIPLINES = [
    { value: "VENTILASJON", label: "Ventilasjon" },
    { value: "BYGGAUTOMASJON", label: "Byggautomasjon" },
    { value: "ELEKTRO", label: "Elektro" },
    { value: "KULDE", label: "Kulde" },
    { value: "RORLEGGER", label: "Rørlegger" },
    { value: "BYGGHERRE", label: "Byggherre" },
    { value: "TOTALENTREPRENOR", label: "Totalentreprenør" },
    { value: "SPRINKLER", label: "Sprinkler" },
    { value: "ANNET", label: "Annet" },
];

export function ProtocolDetail({ project, protocol, members, userId }: ProtocolDetailProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const focusItemId = searchParams.get("item");
    const focusCommentId = searchParams.get("comment");
    const shouldOpenNotes = searchParams.get("notes") === "1" || !!focusCommentId;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const highlightTimerRef = useRef<number | null>(null);
    const deepLinkHandledRef = useRef(false);
    const [items, setItems] = useState(protocol.items || []);
    const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
    const [systemOwner, setSystemOwner] = useState(protocol.systemOwnerId || "");
    const [assignedUser, setAssignedUser] = useState(protocol.assignedUserId || "");
    const [startTime, setStartTime] = useState<Date | undefined>(protocol.startTime ? new Date(protocol.startTime) : undefined);
    const [endTime, setEndTime] = useState<Date | undefined>(protocol.endTime ? new Date(protocol.endTime) : undefined);

    const [pendingAssignee, setPendingAssignee] = useState<string | null>(null);
    const [showCascadeConfirm, setShowCascadeConfirm] = useState(false);

    const [documents, setDocuments] = useState(protocol.documents || []);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedItemForNotes, setSelectedItemForNotes] = useState<any>(null);
    const [selectedItemForPhotos, setSelectedItemForPhotos] = useState<any>(null);
    const [selectedItemForFDV, setSelectedItemForFDV] = useState<any>(null);
    const [selectedItemForLocation, setSelectedItemForLocation] = useState<any>(null);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [viewerData, setViewerData] = useState<{ documentId: string; componentCode: string; page: number } | null>(null);
    const [modelViewerData, setModelViewerData] = useState<{ modelId: string; fullTag: string } | null>(null);
    const [locationMenuOpenFor, setLocationMenuOpenFor] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [mobileExpandedItemId, setMobileExpandedItemId] = useState<string | null>(null);
    const [ncrPromptItem, setNcrPromptItem] = useState<any>(null);

    useEffect(() => {
        if (!focusItemId) return;

        setHighlightItemId(focusItemId);
        setMobileExpandedItemId(focusItemId);

        window.setTimeout(() => {
            const el = document.getElementById(`mc-item-${focusItemId}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);

        if (highlightTimerRef.current) {
            window.clearTimeout(highlightTimerRef.current);
        }

        highlightTimerRef.current = window.setTimeout(() => {
            setHighlightItemId(null);
            highlightTimerRef.current = null;
        }, 4500);

        return () => {
            if (highlightTimerRef.current) {
                window.clearTimeout(highlightTimerRef.current);
                highlightTimerRef.current = null;
            }
        };
    }, [focusItemId]);

    useEffect(() => {
        if (!focusItemId || !shouldOpenNotes) return;
        if (deepLinkHandledRef.current) return;

        const item = items.find((i: any) => i.id === focusItemId);
        if (!item) return;

        setSelectedItemForNotes(item);
        deepLinkHandledRef.current = true;
    }, [focusItemId, shouldOpenNotes, items]);

    function handleShowLocation(item: any) {
        const linkedDocuments = item.linkedDocuments || [];
        const linkedModels = item.linkedModels || [];

        if (linkedDocuments.length === 0 && linkedModels.length === 0) {
            toast.info("Ingen plassering funnet (PDF/Modell)");
            return;
        }

        const componentCode = item.massList?.component || ""; // Use component code for highlighting
        const systemCode = item.massList?.system || "";
        const fullTag = systemCode && componentCode ? `${systemCode}-${componentCode.toUpperCase()}` : "";

        const totalOptions = linkedDocuments.length + linkedModels.length;

        if (totalOptions === 1) {
            if (linkedDocuments.length === 1) {
                // Directly open the single document
                setViewerData({
                    documentId: linkedDocuments[0].docId,
                    componentCode: componentCode,
                    page: linkedDocuments[0].page || 1,
                });
                return;
            }

            if (linkedModels.length === 1) {
                setModelViewerData({
                    modelId: linkedModels[0].modelId,
                    fullTag: linkedModels[0].fullTag || fullTag,
                });
                return;
            }
        }

        // Open selection modal
        setSelectedItemForLocation(item);
    }

    async function updateProtocol(data: any) {
        try {
            const res = await fetch(
                `/api/projects/${project.id}/mc-protocols/${protocol.id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                }
            );
            if (!res.ok) throw new Error("Kunne ikke oppdatere");

            // If cascade is true, reload items to reflect changes immediately in UI
            if (data.cascade) {
                // In a perfect world we would return the updated items from the API
                // For now, refreshing the page or manually updating local state is easiest
                router.refresh();
                // Also update local state for immediate feedback if possible, but setItems is complex here
                // We'll rely on router.refresh() for the bulk update
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            }

            toast.success("Protokoll oppdatert");
        } catch (error) {
            toast.error("Kunne ikke oppdatere protokoll");
            console.error(error);
        }
    }

    function handleAssigneeChange(userId: string) {
        setPendingAssignee(userId);
        setShowCascadeConfirm(true);
    }

    function confirmAssignment(cascade: boolean) {
        if (!pendingAssignee) return;

        setAssignedUser(pendingAssignee);
        updateProtocol({
            assignedUserId: pendingAssignee,
            cascade: cascade
        });

        setShowCascadeConfirm(false);
        setPendingAssignee(null);
    }

    // ... file upload and other helpers ... 

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(
                `/api/projects/${project.id}/mc-protocols/${protocol.id}/documents`,
                { method: "POST", body: formData }
            );
            if (!res.ok) throw new Error("Opplasting feilet");

            const { document } = await res.json();
            setDocuments((prev: any[]) => [document, ...prev]);
            toast.success("Dokument lastet opp");
        } catch (error) {
            toast.error("Kunne ikke laste opp dokument");
            console.error(error);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function deleteDocument(docId: string) {
        try {
            const res = await fetch(
                `/api/projects/${project.id}/mc-protocols/${protocol.id}/documents?documentId=${docId}`,
                { method: "DELETE" }
            );
            if (!res.ok) throw new Error("Sletting feilet");

            setDocuments((prev: any[]) => prev.filter((d: any) => d.id !== docId));
            toast.success("Dokument slettet");
        } catch (error) {
            toast.error("Kunne ikke slette dokument");
            console.error(error);
        }
    }

    // ... updateItem helpers ...

    async function updateItem(itemId: string, data: any) {
        try {
            const previousItem = items.find((item: any) => item.id === itemId);
            const res = await fetch(
                `/api/projects/${project.id}/mc-protocols/${protocol.id}/items/${itemId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                }
            );

            if (!res.ok) throw new Error("Kunne ikke lagre endring");

            const { item: updatedItem } = await res.json();

            setItems((prev: any[]) =>
                prev.map((item: any) =>
                    item.id === itemId ? { ...item, ...updatedItem } : item
                )
            );

            if (updatedItem.completedAt && !protocol.completedAt) {
                toast.success("Protokoll fullført! Varsel sendt til prosjektleder.");
                router.refresh();
            }

            const wasDeviation = previousItem
                ? previousItem.columnA === "DEVIATION" ||
                previousItem.columnB === "DEVIATION" ||
                previousItem.columnC === "DEVIATION"
                : false;
            const isDeviation =
                updatedItem.columnA === "DEVIATION" ||
                updatedItem.columnB === "DEVIATION" ||
                updatedItem.columnC === "DEVIATION";

            if (!wasDeviation && isDeviation) {
                setNcrPromptItem(updatedItem);
            }
        } catch (error) {
            toast.error("Lagring feilet");
            console.error(error);
        }
    }

    function confirmDelete(itemId: string) {
        setItemToDelete(itemId);
    }

    // ... deleteItemWithId ...

    async function deleteItemWithId(itemId: string) {
        try {
            const res = await fetch(
                `/api/projects/${project.id}/mc-protocols/${protocol.id}/items/${itemId}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.details || data.error || "Kunne ikke slette");
            }

            setItems((prev: any[]) => prev.filter((item: any) => item.id !== itemId));
            toast.success("Linje slettet");
        } catch (error: any) {
            toast.error(`Sletting feilet: ${error.message}`);
            console.error(error);
        } finally {
            setItemToDelete(null);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header with Title and Schedule Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold">{protocol.systemName || protocol.systemCode}</h1>
                        <p className="text-muted-foreground">{protocol.systemCode}</p>
                    </div>
                    <Badge variant={protocol.status === "COMPLETED" ? "default" : "secondary"}>
                        {protocol.status === "COMPLETED" ? "Fullført" : "Pågår"}
                    </Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            window.open(`/api/projects/${project.id}/mc-protocols/${protocol.id}/export`, "_blank");
                        }}
                        className="gap-2"
                    >
                        <FileDown size={16} />
                        Eksporter PDF
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEmailModal(true)}
                        className="gap-2"
                    >
                        <Mail size={16} />
                        Send til e-post
                    </Button>
                </div>

                {/* Schedule & Assignment Bar */}
                <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-sm font-medium text-muted-foreground">Periode:</span>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            {/* Start Date */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full sm:w-[140px] justify-start text-left font-normal",
                                            !startTime && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {startTime ? format(startTime, "d. MMM yyyy", { locale: nb }) : <span>Start</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={startTime}
                                        onSelect={(date: Date | undefined) => {
                                            setStartTime(date);
                                            if (!endTime && date) {
                                                setEndTime(date);
                                                updateProtocol({ startTime: date, endTime: date });
                                            } else {
                                                updateProtocol({ startTime: date });
                                            }
                                        }}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>

                            <span className="text-muted-foreground hidden sm:inline">-</span>

                            {/* End Date */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full sm:w-[140px] justify-start text-left font-normal",
                                            !endTime && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {endTime ? format(endTime, "d. MMM yyyy", { locale: nb }) : <span>Slutt</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={endTime}
                                        onSelect={(date: Date | undefined) => {
                                            setEndTime(date);
                                            updateProtocol({ endTime: date });
                                        }}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="hidden sm:block w-px h-6 bg-border mx-2" />

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Tilordnet:</span>
                        <Select
                            value={assignedUser}
                            onValueChange={handleAssigneeChange}
                        >
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Velg ansvarlig" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned">Ingen</SelectItem>
                                {members.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.firstName} {m.lastName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Systemeier & Documents */}
            <Card>
                <CardContent className="pt-4 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Systemeier:</span>
                            <Select
                                value={systemOwner}
                                onValueChange={(val) => {
                                    setSystemOwner(val);
                                    updateProtocol({ systemOwnerId: val });
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-[150px] h-10 sm:h-8">
                                    <SelectValue placeholder="Velg fag" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DISCIPLINES.map((d) => (
                                        <SelectItem key={d.value} value={d.value}>
                                            {d.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Dokumenter:</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileUpload}
                            accept=".pdf,.doc,.docx,.xls,.xlsx"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                                <Upload className="h-4 w-4 mr-1" />
                            )}
                            Last opp
                        </Button>
                        {documents.map((doc: any) => (
                            <div
                                key={doc.id}
                                className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                            >
                                <FileText className="h-3 w-3" />
                                <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline max-w-[150px] truncate"
                                >
                                    {doc.fileName}
                                </a>
                                <button
                                    onClick={() => deleteDocument(doc.id)}
                                    className="text-muted-foreground hover:text-destructive ml-1"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Items (mobile) */}
            <div className="space-y-3 md:hidden">
                {items.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
                        Ingen linjer i protokollen
                    </div>
                ) : null}
                {items.map((item: any) => {
                    const hasDeviation = item.columnA === "DEVIATION" || item.columnB === "DEVIATION" || item.columnC === "DEVIATION";
                    const isComplete = item.completedAt !== null;
                    const linkedDocuments = Array.isArray(item.linkedDocuments) ? item.linkedDocuments : [];
                    const linkedModels = Array.isArray(item.linkedModels) ? item.linkedModels : [];
                    const drawings = linkedDocuments.filter((d: any) => d.docType === "DRAWING");
                    const schemas = linkedDocuments.filter((d: any) => d.docType === "SCHEMA");
                    const hasLocation = drawings.length > 0 || schemas.length > 0 || linkedModels.length > 0;
                    const isExpanded = mobileExpandedItemId === item.id;

                    return (
                        <div
                            key={item.id}
                            id={`mc-item-${item.id}`}
                            className={cn(
                                "rounded-xl border border-border bg-card p-4",
                                hasDeviation && "border-l-4 border-l-red-500 bg-red-50/30",
                                isComplete && !hasDeviation && "bg-green-50/30",
                                highlightItemId === item.id && "ring-2 ring-primary/20"
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm">
                                            {item.massList?.tfm || "—"}
                                        </span>
                                        {hasDeviation ? (
                                            <Badge tone="danger" className="text-xs">Avvik</Badge>
                                        ) : null}
                                        {isComplete && !hasDeviation ? (
                                            <Badge tone="success" className="text-xs">Fullført</Badge>
                                        ) : null}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                        {item.massList?.productName || "—"}
                                    </p>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className={cn(
                                            "h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-card/40 transition-colors",
                                            item.productId ? "text-blue-500 hover:bg-blue-50" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                        )}
                                        title="FDV dokumentasjon"
                                        onClick={() => setSelectedItemForFDV(item)}
                                    >
                                        <Folder className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-card/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        onClick={() => setMobileExpandedItemId(isExpanded ? null : item.id)}
                                        aria-label={isExpanded ? "Skjul detaljer" : "Vis detaljer"}
                                        title={isExpanded ? "Skjul detaljer" : "Vis detaljer"}
                                    >
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-180" : "")} />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="mt-4 space-y-4">
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground">Montasje</p>
                                            <StatusDropdown
                                                value={item.columnA as StatusValue}
                                                onChange={(val) => updateItem(item.id, { columnA: val })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground">Merket</p>
                                            <StatusDropdown
                                                value={item.columnB as StatusValue}
                                                onChange={(val) => updateItem(item.id, { columnB: val })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground">Koblet</p>
                                            <StatusDropdown
                                                value={item.columnC as StatusValue}
                                                onChange={(val) => updateItem(item.id, { columnC: val })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Plassering</p>
                                        <Popover
                                            open={locationMenuOpenFor === item.id}
                                            onOpenChange={(open) => setLocationMenuOpenFor(open ? item.id : null)}
                                        >
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 text-sm w-full justify-between"
                                                    disabled={!hasLocation}
                                                >
                                                    <span className="inline-flex items-center gap-2">
                                                        <MapPin className="h-4 w-4" />
                                                        Plassering
                                                    </span>
                                                    <ChevronDown className="h-4 w-4 opacity-70" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56 p-1" align="start">
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                                                        schemas.length === 0 && "opacity-50 pointer-events-none"
                                                    )}
                                                    onClick={() => {
                                                        setLocationMenuOpenFor(null);
                                                        if (schemas.length === 1) {
                                                            setViewerData({
                                                                documentId: schemas[0].docId,
                                                                componentCode: item.massList?.component || "",
                                                                page: schemas[0].page || 1,
                                                            });
                                                            return;
                                                        }
                                                        setSelectedItemForLocation(item);
                                                    }}
                                                >
                                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                                    <span>Systemskjema</span>
                                                    {schemas.length > 0 ? (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {schemas.length}
                                                        </span>
                                                    ) : null}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                                                        drawings.length === 0 && "opacity-50 pointer-events-none"
                                                    )}
                                                    onClick={() => {
                                                        setLocationMenuOpenFor(null);
                                                        if (drawings.length === 1) {
                                                            setViewerData({
                                                                documentId: drawings[0].docId,
                                                                componentCode: item.massList?.component || "",
                                                                page: drawings[0].page || 1,
                                                            });
                                                            return;
                                                        }
                                                        setSelectedItemForLocation(item);
                                                    }}
                                                >
                                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                                    <span>Arbeidstegning</span>
                                                    {drawings.length > 0 ? (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {drawings.length}
                                                        </span>
                                                    ) : null}
                                                </button>

                                                <Separator className="my-1" />

                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                                                        linkedModels.length === 0 && "opacity-50 pointer-events-none"
                                                    )}
                                                    onClick={() => {
                                                        setLocationMenuOpenFor(null);
                                                        if (linkedModels.length === 1) {
                                                            setModelViewerData({
                                                                modelId: linkedModels[0].modelId,
                                                                fullTag: linkedModels[0].fullTag,
                                                            });
                                                            return;
                                                        }
                                                        setSelectedItemForLocation(item);
                                                    }}
                                                >
                                                    <Box className="h-4 w-4 text-muted-foreground" />
                                                    <span>Modell</span>
                                                    {linkedModels.length > 0 ? (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {linkedModels.length}
                                                        </span>
                                                    ) : null}
                                                </button>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground">Ansvarlig</p>
                                            <Select
                                                value={item.responsibleId || ""}
                                                onValueChange={(val) => updateItem(item.id, { responsibleId: val })}
                                            >
                                                <SelectTrigger className="h-10">
                                                    <SelectValue placeholder="—" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {members.map((m) => (
                                                        <SelectItem key={m.id} value={m.id}>
                                                            {m.firstName} {m.lastName}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground">Utførende</p>
                                            <Select
                                                value={item.executorId || ""}
                                                onValueChange={(val) => updateItem(item.id, { executorId: val })}
                                            >
                                                <SelectTrigger className="h-10">
                                                    <SelectValue placeholder="—" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {members.map((m) => (
                                                        <SelectItem key={m.id} value={m.id}>
                                                            {m.firstName} {m.lastName}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            Dato:{" "}
                                            {item.completedAt
                                                ? format(new Date(item.completedAt), "dd.MM.yy", { locale: nb })
                                                : "—"}
                                        </span>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-card/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground relative"
                                                title="Ta bilde"
                                                onClick={() => setSelectedItemForPhotos(item)}
                                            >
                                                <Camera className="h-4 w-4" />
                                                {item.photos?.length > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                                        {item.photos.length}
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-card/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground relative"
                                                title="Notater"
                                                onClick={() => setSelectedItemForNotes(item)}
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                                {item.notes && (
                                                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                                        1
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-card/40 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                                                title="Slett linje"
                                                onClick={() => confirmDelete(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Items (table) */}
            <div className="hidden md:block border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Montasje</TableHead>
                            <TableHead className="w-[100px]">Merket</TableHead>
                            <TableHead className="w-[100px]">Koblet</TableHead>
                            <TableHead>Komponent</TableHead>
                            <TableHead>Plassering</TableHead>
                            <TableHead className="w-[150px]">Ansvarlig</TableHead>
                            <TableHead className="w-[150px]">Utførende</TableHead>
                            <TableHead className="w-[100px]">Dato</TableHead>
                            <TableHead className="w-[80px]">Behandle</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item: any) => {
                            const hasDeviation = item.columnA === "DEVIATION" || item.columnB === "DEVIATION" || item.columnC === "DEVIATION";
                            const isComplete = item.completedAt !== null;
                            const linkedDocuments = Array.isArray(item.linkedDocuments) ? item.linkedDocuments : [];
                            const linkedModels = Array.isArray(item.linkedModels) ? item.linkedModels : [];
                            const drawings = linkedDocuments.filter((d: any) => d.docType === "DRAWING");
                            const schemas = linkedDocuments.filter((d: any) => d.docType === "SCHEMA");
                            const hasLocation = drawings.length > 0 || schemas.length > 0 || linkedModels.length > 0;
                            return (
                                <TableRow
                                    key={item.id}
                                    id={`mc-item-${item.id}`}
                                    className={cn(
                                        hasDeviation && "border-l-4 border-l-red-500 bg-red-50/30",
                                        isComplete && !hasDeviation && "bg-green-50/30",
                                        highlightItemId === item.id && "bg-primary/10"
                                    )}
                                >
                                    {/* Column A: Montasje */}
                                    <TableCell className="bg-blue-50/10 p-2">
                                        <StatusDropdown
                                            value={item.columnA as StatusValue}
                                            onChange={(val) => updateItem(item.id, { columnA: val })}
                                        />
                                    </TableCell>

                                    {/* Column B: Merket */}
                                    <TableCell className="bg-blue-50/10 p-2">
                                        <StatusDropdown
                                            value={item.columnB as StatusValue}
                                            onChange={(val) => updateItem(item.id, { columnB: val })}
                                        />
                                    </TableCell>

                                    {/* Column C: Koblet */}
                                    <TableCell className="bg-blue-50/10 p-2">
                                        <StatusDropdown
                                            value={item.columnC as StatusValue}
                                            onChange={(val) => updateItem(item.id, { columnC: val })}
                                        />
                                    </TableCell>

                                    {/* Column D: Component */}
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm">
                                                    {item.massList?.tfm || "—"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {item.massList?.productName}
                                                </span>
                                            </div>
                                            <button
                                                className={`p-1 rounded hover:bg-muted ${item.productId ? 'text-blue-500' : 'text-muted-foreground hover:text-foreground'}`}
                                                title="FDV dokumentasjon"
                                                onClick={() => setSelectedItemForFDV(item)}
                                            >
                                                <Folder className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </TableCell>

                                    {/* Column E: Location */}
                                    <TableCell>
                                        <Popover
                                            open={locationMenuOpenFor === item.id}
                                            onOpenChange={(open) => setLocationMenuOpenFor(open ? item.id : null)}
                                        >
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs w-full justify-between"
                                                    disabled={!hasLocation}
                                                >
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="h-3.5 w-3.5" />
                                                        Plassering
                                                    </span>
                                                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56 p-1" align="start">
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                                                        schemas.length === 0 && "opacity-50 pointer-events-none"
                                                    )}
                                                    onClick={() => {
                                                        setLocationMenuOpenFor(null);
                                                        if (schemas.length === 1) {
                                                            setViewerData({
                                                                documentId: schemas[0].docId,
                                                                componentCode: item.massList?.component || "",
                                                                page: schemas[0].page || 1,
                                                            });
                                                            return;
                                                        }
                                                        setSelectedItemForLocation(item);
                                                    }}
                                                >
                                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                                    <span>Systemskjema</span>
                                                    {schemas.length > 0 ? (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {schemas.length}
                                                        </span>
                                                    ) : null}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                                                        drawings.length === 0 && "opacity-50 pointer-events-none"
                                                    )}
                                                    onClick={() => {
                                                        setLocationMenuOpenFor(null);
                                                        if (drawings.length === 1) {
                                                            setViewerData({
                                                                documentId: drawings[0].docId,
                                                                componentCode: item.massList?.component || "",
                                                                page: drawings[0].page || 1,
                                                            });
                                                            return;
                                                        }
                                                        setSelectedItemForLocation(item);
                                                    }}
                                                >
                                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                                    <span>Arbeidstegning</span>
                                                    {drawings.length > 0 ? (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {drawings.length}
                                                        </span>
                                                    ) : null}
                                                </button>

                                                <Separator className="my-1" />

                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                                                        linkedModels.length === 0 && "opacity-50 pointer-events-none"
                                                    )}
                                                    onClick={() => {
                                                        setLocationMenuOpenFor(null);
                                                        if (linkedModels.length === 1) {
                                                            setModelViewerData({
                                                                modelId: linkedModels[0].modelId,
                                                                fullTag: linkedModels[0].fullTag,
                                                            });
                                                            return;
                                                        }
                                                        setSelectedItemForLocation(item);
                                                    }}
                                                >
                                                    <Box className="h-4 w-4 text-muted-foreground" />
                                                    <span>Modell</span>
                                                    {linkedModels.length > 0 ? (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {linkedModels.length}
                                                        </span>
                                                    ) : null}
                                                </button>
                                            </PopoverContent>
                                        </Popover>
                                    </TableCell>

                                    {/* Column F: Responsible */}
                                    <TableCell>
                                        <Select
                                            value={item.responsibleId || ""}
                                            onValueChange={(val) => updateItem(item.id, { responsibleId: val })}
                                        >
                                            <SelectTrigger className="h-8 border-transparent hover:border-input focus:ring-0">
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {members.map((m) => (
                                                    <SelectItem key={m.id} value={m.id}>
                                                        {m.firstName} {m.lastName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>

                                    {/* Column G: Executor */}
                                    <TableCell>
                                        <Select
                                            value={item.executorId || ""}
                                            onValueChange={(val) => updateItem(item.id, { executorId: val })}
                                        >
                                            <SelectTrigger className="h-8 border-transparent hover:border-input focus:ring-0">
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {members.map((m) => (
                                                    <SelectItem key={m.id} value={m.id}>
                                                        {m.firstName} {m.lastName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>

                                    {/* Column H: Date */}
                                    <TableCell>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {item.completedAt
                                                ? format(new Date(item.completedAt), "dd.MM.yy", { locale: nb })
                                                : "—"}
                                        </span>
                                    </TableCell>

                                    {/* Column I: Behandle */}
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <button
                                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground relative"
                                                title="Ta bilde"
                                                onClick={() => setSelectedItemForPhotos(item)}
                                            >
                                                <Camera className="h-4 w-4" />
                                                {item.photos?.length > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                                        {item.photos.length}
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground relative"
                                                title="Notater"
                                                onClick={() => setSelectedItemForNotes(item)}
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                                {item.notes && (
                                                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                                        1
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-700"
                                                title="Slett linje"
                                                onClick={() => confirmDelete(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Correspondence Modal (formerly Notes) */}
            {selectedItemForNotes && (
                <Dialog open={!!selectedItemForNotes} onOpenChange={(open) => !open && setSelectedItemForNotes(null)}>
                    <DialogContent className="sm:max-w-[500px] h-[min(600px,80dvh)] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Korrespondanse</DialogTitle>
                            <DialogDescription>
                                Meldinger knyttet til {selectedItemForNotes.massList?.tfm || "komponent"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-hidden">
                            <CommentThread
                                projectId={project.id}
                                protocolId={protocol.id}
                                itemId={selectedItemForNotes.id}
                                members={members}
                                initialCommentId={selectedItemForNotes.id === focusItemId ? (focusCommentId ?? undefined) : undefined}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Photo Modal */}
            {selectedItemForPhotos && (
                <PhotoCaptureModal
                    open={!!selectedItemForPhotos}
                    onOpenChange={(open) => !open && setSelectedItemForPhotos(null)}
                    itemId={selectedItemForPhotos.id}
                    projectId={project.id}
                    protocolId={protocol.id}
                    existingPhotos={selectedItemForPhotos.photos || []}
                    onPhotosChange={(photos) => {
                        setItems((prev: any[]) =>
                            prev.map((item: any) =>
                                item.id === selectedItemForPhotos.id
                                    ? { ...item, photos }
                                    : item
                            )
                        );
                    }}
                />
            )}

            {/* FDV Modal */}
            {selectedItemForFDV && (
                <FDVModal
                    open={!!selectedItemForFDV}
                    onOpenChange={(open) => !open && setSelectedItemForFDV(null)}
                    item={selectedItemForFDV}
                    projectId={project.id}
                    protocolId={protocol.id}
                    onSave={(productId, product) => {
                        setItems((prev: any[]) =>
                            prev.map((item: any) =>
                                item.id === selectedItemForFDV.id
                                    ? { ...item, productId, product }
                                    : item
                            )
                        );
                    }}
                />
            )}

            {/* Send Email Modal */}
            <SendEmailModal
                open={showEmailModal}
                onOpenChange={setShowEmailModal}
                projectId={project.id}
                itemType="MC_PROTOCOL"
                itemId={protocol.id}
                itemName={protocol.systemName || protocol.systemCode}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Er du sikker?</DialogTitle>
                        <DialogDescription>
                            Dette vil slette linjen permanent. Handlingen kan ikke angres.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setItemToDelete(null)}>Avbryt</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (itemToDelete) deleteItemWithId(itemToDelete);
                            }}
                        >
                            Slett
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* NCR Prompt Dialog */}
            <Dialog open={!!ncrPromptItem} onOpenChange={(open) => !open && setNcrPromptItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Opprett avvik?</DialogTitle>
                        <DialogDescription>
                            Linjen har fått status <strong>Avvik</strong>. Vil du opprette en NCR?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNcrPromptItem(null)}>
                            Senere
                        </Button>
                        <Button
                            onClick={() => {
                                if (!ncrPromptItem) return;
                                const target = `/projects/${project.id}/quality-assurance/ncr/new?linkedItemId=${ncrPromptItem.id}`;
                                setNcrPromptItem(null);
                                router.push(target);
                            }}
                        >
                            Opprett avvik
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Location Selection Modal */}
            {selectedItemForLocation && (
                <LocationModal
                    open={!!selectedItemForLocation}
                    onOpenChange={(open) => !open && setSelectedItemForLocation(null)}
                    documents={selectedItemForLocation.linkedDocuments || []}
                    models={selectedItemForLocation.linkedModels || []}
                    project={project}
                    componentName={selectedItemForLocation.massList?.component || "Komponent"}
                    onDocumentSelect={(doc) => {
                        setViewerData({
                            documentId: doc.docId,
                            componentCode: selectedItemForLocation.massList?.component || "",
                            page: doc.page || 1,
                        });
                    }}
                    onModelSelect={(m) => {
                        setModelViewerData({
                            modelId: m.modelId,
                            fullTag: m.fullTag,
                        });
                    }}
                />
            )}

            {/* Cascade Confirmation Dialog */}
            <Dialog open={showCascadeConfirm} onOpenChange={setShowCascadeConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Oppdater alle linjer?</DialogTitle>
                        <DialogDescription>
                            Vil du sette valgt bruker som <strong>Utførende</strong> på alle komponenter i denne protokollen?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => confirmAssignment(false)}>
                            Nei, kun hode
                        </Button>
                        <Button onClick={() => confirmAssignment(true)}>
                            Ja, oppdater alle
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Document Viewer Modal */}
            {viewerData && (
                <DocumentViewerModal
                    isOpen={!!viewerData}
                    onClose={() => setViewerData(null)}
                    documentId={viewerData.documentId}
                    projectId={project.id}
                    initialComponent={viewerData.componentCode}
                    initialPage={viewerData.page}
                />
            )}

            {modelViewerData && (
                <ModelViewerModal
                    open={!!modelViewerData}
                    onOpenChange={(open) => !open && setModelViewerData(null)}
                    projectId={project.id}
                    modelId={modelViewerData.modelId}
                    initialFullTag={modelViewerData.fullTag}
                />
            )}
        </div>
    );
}

function StatusDropdown({ value, onChange }: { value: StatusValue; onChange: (val: StatusValue) => void }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={`h-8 w-full ${getStatusColor(value)} border-0`}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="NOT_STARTED">Ikke startet</SelectItem>
                <SelectItem value="IN_PROGRESS">Pågår</SelectItem>
                <SelectItem value="COMPLETED">Fullført</SelectItem>
                <SelectItem value="NA">I/A</SelectItem>
                <SelectItem value="DEVIATION">Avvik</SelectItem>
            </SelectContent>
        </Select>
    );
}

function getStatusColor(status: StatusValue) {
    switch (status) {
        case "COMPLETED": return "bg-green-100 text-green-700 font-medium";
        case "NA": return "bg-gray-100 text-gray-500";
        case "DEVIATION": return "bg-red-100 text-red-700 font-medium";
        case "IN_PROGRESS": return "bg-blue-100 text-blue-700";
        default: return "bg-transparent text-muted-foreground";
    }
}
