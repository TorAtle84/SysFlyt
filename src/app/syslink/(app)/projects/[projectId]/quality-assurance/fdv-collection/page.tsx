"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";

type FdvSummary = {
  componentsTotal: number;
  componentsWithFDV: number;
  componentsMissingFDV: number;
  filesTotal: number;
};

type FdvComponent = {
  id: string;
  tfm: string | null;
  systemCode: string | null;
  systemName: string | null;
  name: string;
  productName: string | null;
  supplierName: string | null;
  datasheetCount: number;
  installationCount: number;
  fileCount: number;
  hasFdv: boolean;
};

type MissingComponent = {
  id: string;
  systemCode?: string | null;
  name: string;
};

type FdvCollectionResponse = {
  summary: FdvSummary;
  components: FdvComponent[];
  missingComponents: MissingComponent[];
};

function getDownloadName(contentDisposition: string | null): string {
  if (!contentDisposition) return "fdv-samling.zip";
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (!match) return "fdv-samling.zip";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function FdvCollectionPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [data, setData] = useState<FdvCollectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCollection = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/quality-assurance/fdv-collection`
      );
      if (!response.ok) {
        throw new Error("Kunne ikke hente FDV-samling");
      }
      const payload = await response.json();
      setData(payload);
    } catch (error) {
      console.error(error);
      setError("Kunne ikke hente FDV-samling");
      setData(null);
      toast.error("Kunne ikke hente FDV-samling");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const handleExport = async (allowMissing: boolean) => {
    if (!projectId) return;
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/quality-assurance/fdv-collection/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowMissing }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error || "Kunne ikke generere FDV-zip";
        toast.error(message);
        return;
      }

      const blob = await response.blob();
      const fileName = getDownloadName(response.headers.get("content-disposition"));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("FDV-samling klar for nedlasting");
    } catch (error) {
      console.error(error);
      toast.error("Kunne ikke generere FDV-zip");
    } finally {
      setIsExporting(false);
    }
  };

  const summary = data?.summary || {
    componentsTotal: 0,
    componentsWithFDV: 0,
    componentsMissingFDV: 0,
    filesTotal: 0,
  };

  const hasMissing = summary.componentsMissingFDV > 0;

  const filteredComponents = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.components;

    return data.components.filter((component) =>
      [
        component.tfm,
        component.name,
        component.systemCode,
        component.productName,
        component.supplierName,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  }, [data, search]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">FDV-samling</h1>
          <p className="text-muted-foreground">
            Samle datablader og montasjeanvisninger for eksport til FDV-system
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={fetchCollection} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Oppdater
          </Button>
          <Button
            onClick={() => handleExport(false)}
            disabled={isLoading || isExporting || hasMissing || summary.componentsTotal === 0}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Generer FDV-zip
          </Button>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={isLoading || isExporting || !hasMissing}
              >
                Eksporter likevel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Eksporter med mangler?</DialogTitle>
                <DialogDescription>
                  Eksporten inneholder komponenter uten FDV. Manifestet vil markere
                  dette som en eksport med mangler.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Avbryt
                </Button>
                <Button
                  onClick={() => {
                    setConfirmOpen(false);
                    handleExport(true);
                  }}
                  disabled={isExporting}
                >
                  Eksporter likevel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Komponenter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.componentsTotal}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Med FDV
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{summary.componentsWithFDV}</div>
            <Badge tone="success">OK</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mangler FDV
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{summary.componentsMissingFDV}</div>
            <Badge tone={hasMissing ? "danger" : "muted"}>Mangler</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unike filer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.filesTotal}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Validering</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laster status ...
            </div>
          ) : hasMissing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                {summary.componentsMissingFDV} komponenter mangler FDV
              </div>
              <ScrollArea className="h-40 rounded-md border bg-muted/20">
                <div className="space-y-2 p-3">
                  {data?.missingComponents.map((component) => (
                    <div
                      key={component.id}
                      className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{component.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {component.id}
                          {component.systemCode ? ` - ${component.systemCode}` : ""}
                        </p>
                      </div>
                      <XCircle className="h-4 w-4 text-red-500" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                Eksport er blokkert til alle komponenter har FDV, eller du velger
                "Eksporter likevel".
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Alle komponenter har FDV.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">Komponentoversikt</CardTitle>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Sok komponent, system eller produkt ..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-500">{error}</div>
          ) : filteredComponents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Ingen komponenter matcher soket.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Komponent</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Produkt</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Datablader</TableHead>
                    <TableHead className="text-center">Montasje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComponents.map((component) => (
                    <TableRow key={component.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{component.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {component.tfm || component.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{component.systemCode || "-"}</span>
                          {component.systemName && (
                            <span className="text-xs text-muted-foreground truncate">
                              {component.systemName}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {component.productName || "-"}
                          </span>
                          {component.supplierName && (
                            <span className="text-xs text-muted-foreground">
                              {component.supplierName}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge tone={component.hasFdv ? "success" : "danger"}>
                          {component.hasFdv ? "OK" : "Mangler"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {component.datasheetCount}
                      </TableCell>
                      <TableCell className="text-center">
                        {component.installationCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
