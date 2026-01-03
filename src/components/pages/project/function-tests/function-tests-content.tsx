"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileDown, FileText, ListChecks, Search, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";

type FunctionTestFilter = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DEVIATIONS";

interface FunctionTestWithStats {
  id: string;
  systemCode: string;
  systemName: string | null;
  stats: {
    totalRows: number;
    completedRows: number;
    deviationRows: number;
    progress: number;
  };
}

interface FunctionTestsContentProps {
  project: { id: string; name: string };
  functionTests: FunctionTestWithStats[];
  canCreate: boolean;
}

export function FunctionTestsContent({
  project,
  functionTests,
  canCreate,
}: FunctionTestsContentProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingPlan, setIsExportingPlan] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [functionTestToDelete, setFunctionTestToDelete] = useState<string | null>(null);

  function getStatusBadge(stats: FunctionTestWithStats["stats"]) {
    if (stats.totalRows === 0) {
      return (
        <Badge className="bg-gray-500/15 text-gray-700 hover:bg-gray-500/25 border-gray-200">
          Ikke startet
        </Badge>
      );
    }
    if (stats.progress === 100) {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200">
          Fullført
        </Badge>
      );
    }
    if (stats.progress === 0) {
      return (
        <Badge className="bg-gray-500/15 text-gray-700 hover:bg-gray-500/25 border-gray-200">
          Ikke startet
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 border-blue-200">
        Pågår
      </Badge>
    );
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/projects/${project.id}/function-tests/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunne ikke slette funksjonstest");
      }
      toast.success("Funksjonstest slettet");
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Noe gikk galt";
      toast.error(message);
    } finally {
      setFunctionTestToDelete(null);
    }
  }

  function getProgressColor(progress: number): string {
    if (progress <= 50) return "hsl(30, 95%, 75%)";
    if (progress <= 75) {
      const percentage = (progress - 50) / 25;
      const hue = 30 + percentage * 30;
      return `hsl(${hue}, 95%, 75%)`;
    }
    const percentage = (progress - 75) / 25;
    const hue = 60 + percentage * 82;
    return `hsl(${hue}, 90%, 75%)`;
  }

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return functionTests
      .filter((t) => {
        if (!searchLower) return true;
        return (
          t.systemCode.toLowerCase().includes(searchLower) ||
          t.systemName?.toLowerCase().includes(searchLower)
        );
      })
      .filter((t) => {
        if (filter.size === 0) return true;

        const statusMatches = [];
        if (filter.has("DEVIATIONS") && t.stats.deviationRows > 0) statusMatches.push(true);
        if (filter.has("COMPLETED") && t.stats.totalRows > 0 && t.stats.progress === 100) statusMatches.push(true);
        if (filter.has("NOT_STARTED") && t.stats.progress === 0) statusMatches.push(true);
        if (filter.has("IN_PROGRESS") && t.stats.progress > 0 && t.stats.progress < 100) statusMatches.push(true);

        return statusMatches.length > 0;
      });
  }, [functionTests, search, filter]);

  async function handleGenerateFunctionTests() {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/function-tests`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke generere funksjonstester");

      toast.success(data.message || "Funksjonstester oppdatert");
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Noe gikk galt under generering";
      toast.error(message);
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  }

  function extractFileNameFromContentDisposition(header: string | null): string | null {
    if (!header) return null;

    const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        // ignore
      }
    }

    const fileNameMatch = header.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (fileNameMatch?.[1]) return fileNameMatch[1];

    return null;
  }

  async function handlePlansystemExport() {
    setIsExportingPlan(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/function-tests/plansystem`, {
        method: "GET",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunne ikke eksportere Plansystem");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const fileName =
        extractFileNameFromContentDisposition(res.headers.get("content-disposition")) ||
        `Plansystem_${project.name.replace(/\s+/g, "_")}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Noe gikk galt";
      toast.error(message);
    } finally {
      setIsExportingPlan(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funksjonstest</h1>
          <p className="text-muted-foreground">
            Systematisk funksjonstesting per system – med delansvarlige og full sporbarhet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePlansystemExport}
            disabled={isExportingPlan}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            {isExportingPlan ? "Genererer..." : "Plansystem"}
          </Button>
          {canCreate && (
            <Button onClick={() => setShowGenerateConfirm(true)} disabled={isGenerating}>
              {isGenerating ? "Oppdaterer..." : "Opprett/Oppdater Funksjonstester"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Søk etter system..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full sm:w-80"
          />
        </div>
        <MultiSelectFilter
          title="Status"
          options={[
            { label: "Ikke startet", value: "NOT_STARTED" },
            { label: "Pågår", value: "IN_PROGRESS" },
            { label: "Fullført", value: "COMPLETED" },
            { label: "Med avvik", value: "DEVIATIONS" },
          ]}
          selectedValues={filter}
          onSelectionChange={setFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <ListChecks className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">Ingen funksjonstester</h2>
              <p className="text-sm text-muted-foreground">
                Generer funksjonstester basert på systemkoder funnet i prosjektet.
              </p>
            </div>
            {canCreate && (
              <div className="pt-2">
                <Button onClick={() => setShowGenerateConfirm(true)} disabled={isGenerating}>
                  Opprett nå
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() =>
                router.push(`/syslink/projects/${project.id}/protocols/function-tests/${t.id}`)
              }
            >
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="font-mono">
                    {t.systemCode}
                  </Badge>
                  <div className="flex items-center gap-2">
                    {t.stats.deviationRows > 0 && (
                      <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/25 border-red-200">
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        {t.stats.deviationRows}
                      </Badge>
                    )}
                    {getStatusBadge(t.stats)}
                    {canCreate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFunctionTestToDelete(t.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
                <CardTitle className="leading-snug">
                  {t.systemName || `System ${t.systemCode}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fullført</span>
                      <span className="font-medium">{t.stats.progress}%</span>
                    </div>
                    <Progress
                      value={t.stats.progress}
                      className="h-2"
                      indicatorColor={getProgressColor(t.stats.progress)}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText size={12} />
                      {t.stats.completedRows} / {t.stats.totalRows} tester
                    </span>
                    <ArrowRight size={14} className="opacity-50" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opprett/Oppdater Funksjonstester</DialogTitle>
            <DialogDescription>
              Dette vil opprette funksjonstester per systemkode funnet i prosjektet og legge til nye testpunkter fra
              predefinerte maler. Eksisterende data overskrives ikke.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateConfirm(false)}>
              Avbryt
            </Button>
            <Button
              onClick={() => {
                setShowGenerateConfirm(false);
                handleGenerateFunctionTests();
              }}
              disabled={isGenerating}
            >
              Opprett/Oppdater
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!functionTestToDelete} onOpenChange={() => setFunctionTestToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slett funksjonstest</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil slette denne funksjonstesten? Denne handlingen kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFunctionTestToDelete(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (functionTestToDelete) {
                  handleDelete(functionTestToDelete);
                }
              }}
            >
              Slett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
