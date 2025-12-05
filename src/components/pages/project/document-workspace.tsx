"use client";

import { useState, useCallback } from "react";
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
  Download,
  Box,
  Layers,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DocumentTag {
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
  page: number | null;
  massListMatch: {
    id: string;
    tfm: string | null;
    system: string | null;
    productName: string | null;
    location: string | null;
  } | null;
}

interface DocumentWorkspaceProps {
  project: {
    id: string;
    name: string;
  };
  documents: Document[];
  systemTags: SystemTag[];
  documentType: "DRAWING" | "SCHEMA";
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
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [showComponentsDialog, setShowComponentsDialog] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentFilter, setComponentFilter] = useState("");

  const allTags = [...new Set(documents.flatMap((doc) => doc.tags.map((t) => t.systemTag.code)))];

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags.some((t) =>
        t.systemTag.code.toLowerCase().includes(search.toLowerCase())
      );

    const matchesTag =
      selectedTag === "all" ||
      doc.tags.some((t) => t.systemTag.code === selectedTag);

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
          <div className="flex gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button disabled={uploading} asChild>
                <span>
                  <Upload size={16} className="mr-2" />
                  {uploading ? "Laster opp..." : "Last opp"}
                </span>
              </Button>
            </label>
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
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dokument</TableHead>
              <TableHead>System</TableHead>
              <TableHead className="text-center">Rev</TableHead>
              <TableHead className="text-center">Boksing</TableHead>
              <TableHead className="text-center">Avvik</TableHead>
              <TableHead>Oppdatert</TableHead>
              <TableHead className="text-right">Handlinger</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleShowComponents(doc.id)}
                          title="Vis komponenter"
                        >
                          <Layers size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerify(doc.id)}
                          disabled={verifying === doc.id}
                          title="Verifiser mot masseliste"
                        >
                          {verifying === doc.id ? (
                            <RotateCcw size={16} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                        </Button>
                        <Link href={`/projects/${project.id}/documents/${doc.id}`}>
                          <Button variant="ghost" size="sm" title="Åpne dokument">
                            <Eye size={16} />
                          </Button>
                        </Link>
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
              <div className="grid grid-cols-3 gap-4">
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
                  <div className="max-h-48 overflow-y-auto rounded border">
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

      <Dialog open={showComponentsDialog} onOpenChange={setShowComponentsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Komponenter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Filtrer komponenter..."
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
            />

            {loadingComponents ? (
              <div className="flex items-center justify-center py-8">
                <RotateCcw className="h-6 w-6 animate-spin" />
                <span className="ml-2">Skanner dokument...</span>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>System</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Masseliste-match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComponents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Ingen komponenter funnet
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredComponents.map((comp) => (
                        <TableRow key={comp.id}>
                          <TableCell className="font-mono text-sm">{comp.code}</TableCell>
                          <TableCell>
                            {comp.system ? (
                              <Badge variant="outline">{comp.system}</Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{comp.page || "-"}</TableCell>
                          <TableCell>
                            {comp.massListMatch ? (
                              <div className="text-sm">
                                <div className="font-medium">{comp.massListMatch.productName}</div>
                                <div className="text-muted-foreground">
                                  {comp.massListMatch.location}
                                </div>
                              </div>
                            ) : (
                              <Badge variant="outline" className="border-orange-500 text-orange-500">
                                Ikke funnet
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-between">
              <div className="text-sm text-muted-foreground">
                {components.length} komponenter, {components.filter((c) => c.massListMatch).length} med match
              </div>
              <Button variant="outline" onClick={() => setShowComponentsDialog(false)}>
                Lukk
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
