"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Search,
  Filter,
  Upload,
  Eye,
  FileText,
  Tag,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Box,
  Layers,
  ChevronDown,
  X,
  Pencil,
  Check,
  ClipboardList,
  ArrowUp,
  ArrowDown,
  Trash2,
  ScanSearch,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentViewerModal } from "./document-viewer-modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { DocumentUploadHelp } from "@/components/ui/help-tooltip";

interface DocumentTag {
  role?: "PRIMARY" | "DELANSVARLIG";
  systemTag: {
    id: string;
    code: string;
    description: string | null;
  };
}

interface SystemAnnotation {
  id: string;
  systemCode: string | null;
}

interface Document {
  id: string;
  title: string;
  fileName: string | null;
  url: string;
  type: string;
  revision: number;
  isLatest: boolean;
  approvedDeviations: number;
  primarySystem?: string | null;
  createdAt: string;
  updatedAt: string;
  tags: DocumentTag[];
  systemAnnotations: SystemAnnotation[];
  _count?: {
    annotations: number;
    components: number;
  };
}

interface SystemTag {
  id: string;
  code: string;
  description: string | null;
}

interface VerificationResult {
  documentId: string;
  totalComponents: number;
  matchedComponents: number;
  unmatchedComponents: {
    code: string;
    system: string | null;
    x: number;
    y: number;
    page: number;
  }[];
  matches: {
    component: { code: string; system: string | null };
    massListItem: {
      id: string;
      tfm: string | null;
      system: string | null;
      productName: string | null;
    };
  }[];
}

interface ComponentData {
  id: string;
  code: string;
  system: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  page: number | null;
  verifiedByText: boolean;
  textConfidence: number;
  massListMatch: {
    id: string;
    tfm: string | null;
    system: string | null;
    productName: string | null;
    location: string | null;
  } | null;
}

interface SystemScanResult {
  systems: Array<{
    code: string;
    byggnr: string | null;
    page: number;
    x: number;
    y: number;
    context: string;
    role: "PRIMARY" | "DELANSVARLIG";
  }>;
  primarySystem: string | null;
}

interface DocumentWorkspaceProps {
  project: {
    id: string;
    name: string;
  };
  documents: Document[];
  systemTags: SystemTag[];
  documentType: "DRAWING" | "SCHEMA" | "FUNCTION_DESCRIPTION";
  canUpload: boolean;
}

export function DocumentWorkspace({
  project,
  documents,
  systemTags,
  documentType,
  canUpload,
}: DocumentWorkspaceProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [showSystemDialog, setShowSystemDialog] = useState(false);
  const [systemScanResult, setSystemScanResult] = useState<SystemScanResult | null>(null);

  // Document Viewer Modal State
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [viewDocumentId, setViewDocumentId] = useState<string | null>(null);

  const [scanningSystemDocId, setScanningSystemDocId] = useState<string | null>(null);
  const [showComponentsDialog, setShowComponentsDialog] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentFilter, setComponentFilter] = useState("");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [mobileDocActionsOpenFor, setMobileDocActionsOpenFor] = useState<string | null>(null);
  const [customPattern, setCustomPattern] = useState("");
  const [isCustomScanning, setIsCustomScanning] = useState(false);
  const [isSavingSystems, setIsSavingSystems] = useState(false);

  const [customComponentPattern, setCustomComponentPattern] = useState("");
  const [isComponentScanning, setIsComponentScanning] = useState(false);
  const [isSavingComponents, setIsSavingComponents] = useState(false);
  const [isUpdatingSystems, setIsUpdatingSystems] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper to determine primary system:
  // 1. Explicit primarySystem field
  // 2. Tag with role="PRIMARY"
  // 3. First tag (ordered by order)
  const getPrimarySystem = (doc: Document) => {
    if (doc.primarySystem) return doc.primarySystem;
    const primaryTag = doc.tags.find((t) => t.role === "PRIMARY");
    if (primaryTag) return primaryTag.systemTag.code;
    return doc.tags[0]?.systemTag.code || null;
  };

  // Only show primary systems in the filter dropdown
  const allTags = [...new Set(documents.map((doc) => getPrimarySystem(doc)).filter((s): s is string => !!s))].sort();

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags.some((t) =>
        t.systemTag.code.toLowerCase().includes(search.toLowerCase())
      );

    const matchesTag =
      selectedTag === "all" ||
      getPrimarySystem(doc) === selectedTag;

    return matchesSearch && matchesTag;
  });

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("type", documentType);
      formData.append("autoTag", "true");

      const res = await fetch(`/api/projects/${project.id}/documents`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [project.id, documentType, router]);

  const handleVerify = useCallback(async (documentId: string) => {
    setVerifying(documentId);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/documents/${documentId}/verify`,
        { method: "POST" }
      );

      if (res.ok) {
        const result = await res.json();
        setVerificationResult(result);
        setShowVerificationDialog(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVerifying(null);
    }
  }, [project.id]);

  const handleShowComponents = useCallback(async (documentId: string) => {
    setSelectedDocId(documentId);
    setLoadingComponents(true);
    setShowComponentsDialog(true);

    try {
      const res = await fetch(
        `/api/projects/${project.id}/documents/${documentId}/components?rescan=true`
      );

      if (res.ok) {
        const data = await res.json();
        setComponents(data.components || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComponents(false);
    }
  }, [project.id]);

  const handleApproveDeviation = useCallback(async (documentId: string) => {
    try {
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;

      await fetch(`/api/projects/${project.id}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedDeviations: doc.approvedDeviations + 1,
        }),
      });

      router.refresh();
    } catch (err) {
      console.error(err);
    }
  }, [project.id, documents, router]);

  const handleCustomScan = async () => {
    if (!scanningSystemDocId || !customPattern.trim()) return;
    setIsCustomScanning(true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/documents/${scanningSystemDocId}/search-pattern`,
        {
          method: "POST",
          body: JSON.stringify({ pattern: customPattern.trim() }),
        }
      );
      if (res.ok) {
        const { matches } = await res.json();
        setSystemScanResult((prev) => {
          const existingResult = prev || { systems: [], primarySystem: null };
          // Merge new matches
          const newSystems = matches.map((m: any) => ({
            code: m.code,
            page: m.page,
            x: m.x,
            y: m.y,
            context: m.context,
            byggnr: null,
            role: "DELANSVARLIG" as const,
          }));

          // Filter duplicates
          const existingCodes = new Set(existingResult.systems.map(s => s.code));
          const uniqueNew = newSystems.filter((s: any) => !existingCodes.has(s.code));

          const mergedSystems = [...existingResult.systems, ...uniqueNew];
          return {
            systems: mergedSystems,
            primarySystem: existingResult.primarySystem || (mergedSystems.length > 0 ? mergedSystems[0].code : null),
          };
        });
        setCustomPattern("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCustomScanning(false);
    }
  };

  const handleSaveSystems = async () => {
    if (!scanningSystemDocId || !systemScanResult) return;
    setIsSavingSystems(true);
    try {
      // Prepare payload
      const systems = systemScanResult.systems.map((s, idx) => ({
        code: s.code,
        order: idx,
        role: s.role,
      }));

      const res = await fetch(
        `/api/projects/${project.id}/documents/${scanningSystemDocId}/systems/save`,
        {
          method: "POST",
          body: JSON.stringify({
            systems,
            primarySystem: systemScanResult.primarySystem
          }),
        }
      );

      if (res.ok) {
        router.refresh();
        setShowSystemDialog(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingSystems(false);
    }
  };

  const handleUpdateTitle = async () => {
    if (!editingDocId || !editTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${editingDocId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        router.refresh();
        setEditingDocId(null);
        setEditTitle("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleCustomComponentScan = async () => {
    if (!selectedDocId || !customComponentPattern.trim()) return;
    setIsComponentScanning(true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/documents/${selectedDocId}/search-pattern`,
        {
          method: "POST",
          body: JSON.stringify({ pattern: customComponentPattern.trim() }),
        }
      );
      if (res.ok) {
        const { matches } = await res.json();
        setComponents((prev) => {
          const newComps = matches.map((m: any) => ({
            id: `temp-${Math.random()}`,
            code: m.code,
            system: null,
            x: m.x,
            y: m.y,
            page: m.page,
            massListMatch: null
          }));

          const existingCodes = new Set(prev.map(c => c.code));
          const uniqueNew = newComps.filter((c: any) => !existingCodes.has(c.code));

          return [...prev, ...uniqueNew];
        });
        setCustomComponentPattern("");
      }
    } catch (err) {
      console.error(err);
      setIsComponentScanning(false);
    }
  };

  const handleUpdateSystems = async () => {
    if (!selectedDocId) return;
    setIsUpdatingSystems(true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/documents/${selectedDocId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enableGeometry: true, save: true }),
        }
      );

      if (res.ok) {
        // Refresh component list WITHOUT rescanning (to preserve geometry assignments)
        setLoadingComponents(true);
        const compRes = await fetch(
          `/api/projects/${project.id}/documents/${selectedDocId}/components`
        );
        if (compRes.ok) {
          const data = await compRes.json();
          setComponents(data.components || []);
        }
        setLoadingComponents(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingSystems(false);
    }
  };

  const handleSaveComponents = async () => {
    if (!selectedDocId) return;
    setIsSavingComponents(true);
    try {
      const payload = components.map((c) => ({
        code: c.code,
        system: c.system,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        page: c.page,
        verifiedByText: c.verifiedByText,
        textConfidence: c.textConfidence,
      }));

      const res = await fetch(
        `/api/projects/${project.id}/documents/${selectedDocId}/components/save`,
        {
          method: "POST",
          body: JSON.stringify({ components: payload }),
        }
      );

      if (res.ok) {
        router.refresh();
        setShowComponentsDialog(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingComponents(false);
    }
  };

  const moveComponent = (index: number, direction: 'up' | 'down') => {
    const newComps = [...components];
    if (direction === 'up' && index > 0) {
      [newComps[index - 1], newComps[index]] = [newComps[index], newComps[index - 1]];
    } else if (direction === 'down' && index < newComps.length - 1) {
      [newComps[index + 1], newComps[index]] = [newComps[index], newComps[index + 1]];
    }
    setComponents(newComps);
  };

  const removeComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const moveSystem = (index: number, direction: 'up' | 'down') => {
    if (!systemScanResult) return;
    const newSystems = [...systemScanResult.systems];
    if (direction === 'up' && index > 0) {
      [newSystems[index - 1], newSystems[index]] = [newSystems[index], newSystems[index - 1]];
    } else if (direction === 'down' && index < newSystems.length - 1) {
      [newSystems[index + 1], newSystems[index]] = [newSystems[index], newSystems[index + 1]];
    }

    const primarySystem = newSystems.length > 0 ? newSystems[0].code : null;

    setSystemScanResult({
      ...systemScanResult,
      systems: newSystems,
      primarySystem
    });
  };

  const removeSystem = (index: number) => {
    if (!systemScanResult) return;
    const newSystems = systemScanResult.systems.filter((_, i) => i !== index);
    const primarySystem = newSystems.length > 0 ? newSystems[0].code : null;

    setSystemScanResult({
      ...systemScanResult,
      systems: newSystems,
      primarySystem
    });
  };

  async function handleGenerateProtocols(doc: Document) {
    const systemTags = doc.tags.map((t) => t.systemTag.code);

    if (!confirm(`Vil du opprette / oppdatere MC-protokoller for komponenter funnet i dette dokumentet?`)) {
      return;
    }

    const toastId = toast.loading("Genererer protokoller...");

    try {
      const res = await fetch(`/api/projects/${project.id}/mc-protocols`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message, { id: toastId });
      } else {
        toast.error(data.error || "Feil ved generering", { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error("Kunne ikke kontakte serveren", { id: toastId });
    }
  }

  const filteredComponents = components.filter((c) =>
    c.code.toLowerCase().includes(componentFilter.toLowerCase()) ||
    (c.system?.toLowerCase().includes(componentFilter.toLowerCase()))
  );

  const typeLabel = documentType === "SCHEMA" ? "Systemskjema" : "Arbeidstegning";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{typeLabel}</h2>
          <p className="text-sm text-muted-foreground">
            {filteredDocuments.length} dokument{filteredDocuments.length !== 1 ? "er" : ""}
          </p>
        </div>

        {canUpload && (
          <div className="flex gap-2 items-center">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <span className={cn(buttonVariants({ variant: "default" }), uploading && "opacity-50 pointer-events-none")}>
                <Upload size={16} className="mr-2" />
                {uploading ? "Laster opp..." : "Last opp"}
              </span>
            </label>
            <DocumentUploadHelp />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Søk etter dokument eller systemkode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {mounted ? (
          <Select value={selectedTag} onValueChange={setSelectedTag}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter size={16} className="mr-2" />
              <SelectValue placeholder="Alle systemer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle systemer</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="w-full sm:w-48 h-10 border rounded-md bg-background" />
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {filteredDocuments.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Ingen dokumenter funnet
          </div>
        ) : null}
        {filteredDocuments.map((doc) => {
          const boxedCount = doc.systemAnnotations.filter((a) => a.systemCode).length;
          const open = mobileDocActionsOpenFor === doc.id;

          return (
            <div key={doc.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-start gap-2">
                    <FileText size={16} className="mt-0.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{doc.title}</p>
                      {doc.fileName ? (
                        <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {doc.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag.systemTag.id} variant="outline" className="text-xs">
                        {tag.systemTag.code}
                      </Badge>
                    ))}
                    {doc.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{doc.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>

                <Popover open={open} onOpenChange={(v) => setMobileDocActionsOpenFor(v ? doc.id : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 px-3">
                      Handlinger
                      <ChevronDown size={16} className="opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-1" align="end">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setMobileDocActionsOpenFor(null);
                        setScanningSystemDocId(doc.id);
                        setShowSystemDialog(true);
                      }}
                    >
                      <ScanSearch className="h-4 w-4 text-muted-foreground" />
                      <span>Skann for systemer</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setMobileDocActionsOpenFor(null);
                        handleShowComponents(doc.id);
                      }}
                    >
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span>Vis komponenter</span>
                    </button>

                    <Separator className="my-1" />

                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                        verifying === doc.id && "opacity-60 pointer-events-none"
                      )}
                      onClick={() => {
                        setMobileDocActionsOpenFor(null);
                        handleVerify(doc.id);
                      }}
                    >
                      {verifying === doc.id ? (
                        <RotateCcw className="h-4 w-4 animate-spin text-green-600" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      <span>Verifiser mot masseliste</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setMobileDocActionsOpenFor(null);
                        handleGenerateProtocols(doc);
                      }}
                    >
                      <ClipboardList className="h-4 w-4 text-orange-600" />
                      <span>Generer protokoller</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setMobileDocActionsOpenFor(null);
                        setViewDocumentId(doc.id);
                        setShowViewerModal(true);
                      }}
                    >
                      <Eye className="h-4 w-4 text-blue-600" />
                      <span>Åpne dokument</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted hover:text-destructive"
                      onClick={() => {
                        setMobileDocActionsOpenFor(null);
                        setDeleteDocId(doc.id);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                      <span>Slett dokument</span>
                    </button>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">Rev {doc.revision}</Badge>
                {boxedCount > 0 ? (
                  <Badge variant="default" className="gap-1">
                    <Box size={12} />
                    {boxedCount} bokser
                  </Badge>
                ) : (
                  <Badge tone="muted">Ingen bokser</Badge>
                )}
                {doc.approvedDeviations > 0 ? (
                  <Badge tone="warning" className="gap-1">
                    <AlertTriangle size={12} />
                    {doc.approvedDeviations} avvik
                  </Badge>
                ) : (
                  <Badge tone="success" className="gap-1">
                    <CheckCircle2 size={12} />
                    Ingen avvik
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  Oppdatert {format(new Date(doc.updatedAt), "d. MMM yyyy", { locale: nb })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dokument</TableHead>
              <TableHead>System</TableHead>
              <TableHead className="text-center">Rev</TableHead>
              {documentType !== "FUNCTION_DESCRIPTION" && (
                <TableHead className="text-center">Boksing</TableHead>
              )}
              <TableHead className="text-center">Avvik</TableHead>
              <TableHead>Oppdatert</TableHead>
              <TableHead className="text-right">Handlinger</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={documentType === "FUNCTION_DESCRIPTION" ? 6 : 7} className="h-24 text-center text-muted-foreground">
                  Ingen dokumenter funnet
                </TableCell>
              </TableRow>
            ) : (
              filteredDocuments.map((doc) => {
                const boxedCount = doc.systemAnnotations.filter((a) => a.systemCode).length;

                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-muted-foreground" />
                        <div>
                          <div className="font-medium">{doc.title}</div>
                          {doc.fileName && (
                            <div className="text-xs text-muted-foreground">
                              {doc.fileName}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {doc.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag.systemTag.id} variant="outline" className="text-xs">
                            {tag.systemTag.code}
                          </Badge>
                        ))}
                        {doc.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{doc.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{doc.revision}</Badge>
                    </TableCell>
                    {documentType !== "FUNCTION_DESCRIPTION" && (
                      <TableCell className="text-center">
                        {boxedCount > 0 ? (
                          <Badge variant="default" className="gap-1">
                            <Box size={12} />
                            {boxedCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      {doc.approvedDeviations > 0 ? (
                        <Badge variant="outline" className="gap-1 border-orange-500 text-orange-500">
                          <AlertTriangle size={12} />
                          {doc.approvedDeviations}
                        </Badge>
                      ) : (
                        <CheckCircle2 size={16} className="mx-auto text-green-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(doc.updatedAt), "d. MMM yyyy", { locale: nb })}
                    </TableCell>
                    <TableCell>
                      <div className="grid grid-cols-3 gap-1 w-fit ml-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setScanningSystemDocId(doc.id);
                            setShowSystemDialog(true);
                            setSystemScanResult(null);

                            // Fetch systems scan results
                            try {
                              const res = await fetch(
                                `/api/projects/${project.id}/documents/${doc.id}/systems`,
                                { method: "POST" }
                              );
                              if (res.ok) {
                                const data = await res.json();
                                // Add default roles: first is PRIMARY, rest are DELANSVARLIG
                                const systemsWithRoles = (data.systems || []).map((s: any, idx: number) => ({
                                  ...s,
                                  role: idx === 0 ? "PRIMARY" : "DELANSVARLIG",
                                }));
                                setSystemScanResult({
                                  systems: systemsWithRoles,
                                  primarySystem: data.primarySystem || (systemsWithRoles.length > 0 ? systemsWithRoles[0].code : null),
                                });
                              }
                            } catch (err) {
                              console.error("Error scanning systems:", err);
                            }
                          }}
                          title="Skann for systemer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ScanSearch size={16} />
                        </Button>
                        {documentType !== "FUNCTION_DESCRIPTION" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowComponents(doc.id)}
                              title="Vis komponenter"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Layers size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleVerify(doc.id)}
                              disabled={verifying === doc.id}
                              title="Verifiser mot masseliste"
                              className="text-green-500 hover:text-green-700 hover:bg-green-50"
                            >
                              {verifying === doc.id ? (
                                <RotateCcw size={16} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleGenerateProtocols(doc)}
                              title="Generer protokoller"
                              className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                            >
                              <ClipboardList size={16} />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Åpne dokument"
                          onClick={() => {
                            setViewDocumentId(doc.id);
                            setShowViewerModal(true);
                          }}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Eye size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteDocId(doc.id);
                            setShowDeleteDialog(true);
                          }}
                          title="Slett dokument"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Verifiseringsresultat</DialogTitle>
          </DialogHeader>
          {verificationResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{verificationResult.totalComponents}</div>
                    <div className="text-sm text-muted-foreground">Totalt funnet</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600">
                      {verificationResult.matchedComponents}
                    </div>
                    <div className="text-sm text-muted-foreground">Treff i masseliste</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-orange-600">
                      {verificationResult.unmatchedComponents.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Avvik</div>
                  </CardContent>
                </Card>
              </div>

              {verificationResult.unmatchedComponents.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">Komponenter uten match:</h4>
                  <div className="md:hidden space-y-2">
                    {verificationResult.unmatchedComponents.slice(0, 10).map((comp, i) => (
                      <div key={i} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-medium truncate">{comp.code}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              System: {comp.system || "-"} • Side: {comp.page}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApproveDeviation(verificationResult.documentId)}
                          >
                            Godkjenn
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block max-h-48 overflow-y-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kode</TableHead>
                          <TableHead>System</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead className="text-right">Handling</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {verificationResult.unmatchedComponents.slice(0, 10).map((comp, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{comp.code}</TableCell>
                            <TableCell>{comp.system || "-"}</TableCell>
                            <TableCell>{comp.page}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleApproveDeviation(verificationResult.documentId)}
                              >
                                Godkjenn avvik
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowVerificationDialog(false)}>
                  Lukk
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DocumentViewerModal
        isOpen={showViewerModal}
        onClose={() => {
          setShowViewerModal(false);
          setViewDocumentId(null);
        }}
        documentId={viewDocumentId}
        projectId={project.id}
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slett dokument</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil slette dette dokumentet? Denne handlingen kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteDocId(null);
              }}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteDocId) return;
                try {
                  const res = await fetch(`/api/projects/${project.id}/documents/${deleteDocId}`, {
                    method: "DELETE",
                  });
                  if (res.ok) {
                    setShowDeleteDialog(false);
                    setDeleteDocId(null);
                    router.refresh();
                  } else {
                    alert("Kunne ikke slette dokumentet.");
                  }
                } catch (err) {
                  alert("En feil oppstod.");
                }
              }}
            >
              Slett
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSystemDialog} onOpenChange={setShowSystemDialog}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle>Systemnummer funnet</DialogTitle>
            <DialogDescription className="hidden">
              Liste over systemer funnet i dokumentet
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 pt-2 gap-4">
            <div className="flex gap-2 shrink-0">
              <Input
                placeholder="Eget mønster (f.eks. 37001.* eller RTA4001)"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomScan();
                }}
              />
              <Button
                onClick={handleCustomScan}
                disabled={isCustomScanning || !customPattern.trim()}
              >
                {isCustomScanning ? <RotateCcw className="animate-spin h-4 w-4" /> : <Search size={16} />}
              </Button>
            </div>

            {systemScanResult ? (
              <div className="flex-1 overflow-hidden flex flex-col space-y-4 min-h-0">
                <div className="rounded-lg bg-muted p-3 text-sm shrink-0">
                  {systemScanResult.systems.length > 0 ? (
                    <>
                      <div className="font-medium text-foreground">
                        Primærsystem: {systemScanResult.primarySystem}
                      </div>
                      <p className="text-muted-foreground">
                        Sortert etter rekkefølge. Øverste system settes som primær. Du kan endre rekkefølgen under.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      Ingen systemkoder funnet. Prøv et eget mønster.
                    </p>
                  )}
                </div>

                {systemScanResult.systems.length > 0 && (
                  <div className="flex-1 overflow-y-auto min-h-0 border rounded-md">
                    <div className="divide-y">
                      {systemScanResult.systems.map((sys, idx) => (
                        <div
                          key={`${sys.code}-${idx}`}
                          className="flex items-center justify-between p-2 hover:bg-muted/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                disabled={idx === 0}
                                onClick={() => moveSystem(idx, 'up')}
                              >
                                <ArrowUp size={12} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                disabled={idx === systemScanResult.systems.length - 1}
                                onClick={() => moveSystem(idx, 'down')}
                              >
                                <ArrowDown size={12} />
                              </Button>
                            </div>
                            <div>
                              <div className="font-mono text-sm font-medium">
                                {sys.code}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Side {sys.page} • x={sys.x.toFixed(1)}% • y={sys.y.toFixed(1)}%
                                {sys.byggnr ? ` • Bygg ${sys.byggnr}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={sys.role}
                              onValueChange={(value: "PRIMARY" | "DELANSVARLIG") => {
                                setSystemScanResult((prev) => {
                                  if (!prev) return null;
                                  const newSystems = prev.systems.map((s, i) => {
                                    if (i === idx) {
                                      return { ...s, role: value };
                                    }
                                    // If setting as PRIMARY, demote all others to DELANSVARLIG
                                    if (value === "PRIMARY" && s.role === "PRIMARY") {
                                      return { ...s, role: "DELANSVARLIG" as const };
                                    }
                                    return s;
                                  });
                                  const primary = newSystems.find(s => s.role === "PRIMARY");
                                  return {
                                    ...prev,
                                    systems: newSystems,
                                    primarySystem: primary?.code || null,
                                  };
                                });
                              }}
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PRIMARY">Primær</SelectItem>
                                <SelectItem value="DELANSVARLIG">Delansvarlig</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSystem(idx)}
                            >
                              <X size={16} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ingen resultater tilgjengelig.
              </p>
            )}

            <div className="flex justify-between pt-2 border-t mt-auto">
              <Button variant="outline" onClick={() => setShowSystemDialog(false)}>
                Lukk
              </Button>
              <Button
                onClick={handleSaveSystems}
                disabled={isSavingSystems || !systemScanResult}
              >
                {isSavingSystems ? "Lagrer..." : (
                  <>
                    <Save size={16} className="mr-2" />
                    Lagre endringer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showComponentsDialog} onOpenChange={setShowComponentsDialog}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Komponenter: {components.length} stk</DialogTitle>
            <DialogDescription className="hidden">
              Oversikt over komponenter i dokumentet
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 flex-1 overflow-hidden min-h-0">
            <div className="flex flex-col gap-3 p-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Eget mønster (f.eks. RT.* eller 360.*)"
                  value={customComponentPattern}
                  onChange={(e) => setCustomComponentPattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCustomComponentScan();
                  }}
                  className="h-10 w-full sm:h-9 sm:w-64"
                />
                <Button
                  onClick={handleCustomComponentScan}
                  disabled={isComponentScanning || !customComponentPattern.trim()}
                  size="sm"
                  className="h-10 sm:h-9 px-4 w-full sm:w-auto"
                >
                  {isComponentScanning ? <RotateCcw className="animate-spin h-4 w-4 mr-2" /> : <Search size={16} className="mr-2" />}
                  Søk
                </Button>
                <Button
                  onClick={handleUpdateSystems}
                  disabled={isUpdatingSystems}
                  variant="outline"
                  size="sm"
                  className="h-10 sm:h-9 w-full sm:w-auto"
                  title="Oppdater systemer fra systembokser"
                >
                  <Box size={16} className={`mr-2 ${isUpdatingSystems ? "animate-spin" : ""}`} />
                  Oppdater fra bokser
                </Button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-72">
                <Filter size={16} className="text-muted-foreground" />
                <Input
                  placeholder="Filtrer visning..."
                  value={componentFilter}
                  onChange={(e) => setComponentFilter(e.target.value)}
                  className="h-10 sm:h-9"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto border rounded-md relative bg-background">
              {loadingComponents ? (
                <div className="flex justify-center p-8">
                  <RotateCcw className="animate-spin text-muted-foreground" />
                </div>
              ) : components.length > 0 ? (
                <>
                  <div className="md:hidden p-3 space-y-2">
                    {filteredComponents.map((comp, idx) => {
                      const realIndex = components.indexOf(comp);
                      return (
                        <div key={comp.id || idx} className="rounded-lg border border-border bg-card p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {comp.system || "-"}
                                </span>
                                <span className="font-mono font-medium">{comp.code}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {comp.x != null && comp.y != null
                                  ? `x=${comp.x.toFixed(1)}%  y=${comp.y.toFixed(1)}%`
                                  : "—"}
                              </p>
                              <div className="mt-2">
                                {comp.massListMatch ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                                    <CheckCircle2 size={12} />
                                    {comp.massListMatch.productName || "Funnet"}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground bg-gray-50">
                                    Ingen match
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => moveComponent(realIndex, 'up')}
                                disabled={realIndex === 0 || componentFilter.length > 0}
                                title="Flytt opp"
                              >
                                <ArrowUp size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => moveComponent(realIndex, 'down')}
                                disabled={realIndex === components.length - 1 || componentFilter.length > 0}
                                title="Flytt ned"
                              >
                                <ArrowDown size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => removeComponent(realIndex)}
                                title="Fjern"
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <table className="hidden md:table w-full text-sm text-left">
                    <TableHeader className="bg-background sticky top-0 z-20 shadow-sm">
                      <TableRow>
                        <TableHead className="w-[150px]">System</TableHead>
                        <TableHead className="w-[150px]">Komponent</TableHead>
                        <TableHead className="w-[150px]">Koordinater</TableHead>
                        <TableHead className="w-[200px]">Masselistematch</TableHead>
                        <TableHead className="w-[100px] text-right">Behandling</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredComponents.map((comp, idx) => {
                        const realIndex = components.indexOf(comp);
                        return (
                          <TableRow key={comp.id || idx}>
                            <TableCell className="font-mono text-sm">
                              {comp.system || <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="font-mono font-medium">
                              {comp.code}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {comp.x != null && comp.y != null ? (
                                <>
                                  x={comp.x.toFixed(1)}%<br />
                                  y={comp.y.toFixed(1)}%
                                </>
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              {comp.massListMatch ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                                  <CheckCircle2 size={12} />
                                  {comp.massListMatch.productName || "Funnet"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground bg-gray-50">
                                  Ingen match
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => moveComponent(realIndex, 'up')}
                                  disabled={realIndex === 0 || componentFilter.length > 0}
                                >
                                  <ArrowUp size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => moveComponent(realIndex, 'down')}
                                  disabled={realIndex === components.length - 1 || componentFilter.length > 0}
                                >
                                  <ArrowDown size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => removeComponent(realIndex)}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </table>
                </>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  Ingen komponenter funnet. Prøv et søk eller last opp på nytt.
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2 border-t mt-auto">
              <Button variant="outline" onClick={() => setShowComponentsDialog(false)}>
                Lukk
              </Button>
              <Button
                onClick={handleSaveComponents}
                disabled={isSavingComponents || components.length === 0}
              >
                {isSavingComponents ? "Lagrer..." : (
                  <>
                    <Save size={16} className="mr-2" />
                    Lagre endringer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
