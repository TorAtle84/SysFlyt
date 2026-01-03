"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Search,
  Plus,
  ArrowRight,
  FileText,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProtocolWithStats {
  id: string;
  systemCode: string;
  systemName: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "APPROVED";
  stats: {
    totalItems: number;
    completedItems: number;
    progress: number;
  };
}

interface ProtocolsContentProps {
  project: { id: string; name: string };
  protocols: ProtocolWithStats[];
  canCreate: boolean;
}

export function ProtocolsContent({
  project,
  protocols,
  canCreate,
}: ProtocolsContentProps) {
  const router = useRouter();

  function getProgressColor(progress: number): string {
    if (progress <= 50) {
      // Light Pastel Orange
      return "hsl(30, 95%, 75%)";
    } else if (progress <= 75) {
      // Gradient towards Light Pastel Yellow
      // 50% = 30 hue, 75% = 60 hue
      const percentage = (progress - 50) / 25; // 0 to 1
      const hue = 30 + (percentage * 30); // 30 to 60
      return `hsl(${hue}, 95%, 75%)`;
    } else {
      // Gradient towards Green
      // 75% = 60 hue, 100% = 142 hue
      const percentage = (progress - 75) / 25; // 0 to 1
      const hue = 60 + (percentage * 82); // 60 to 142
      return `hsl(${hue}, 90%, 75%)`;
      // Note: Kept lightness high (75%) for pastel look
    }
  }
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [protocolToDelete, setProtocolToDelete] = useState<string | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  async function handleDelete(protocolId: string) {
    try {
      const res = await fetch(`/api/projects/${project.id}/mc-protocols/${protocolId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Kunne ikke slette protokoll");

      toast.success("Protokoll slettet");
      router.refresh();
    } catch (error) {
      toast.error("Kunne ikke slette protokoll");
      console.error(error);
    } finally {
      setProtocolToDelete(null);
    }
  }

  const filteredProtocols = protocols.filter((p) => {
    const searchLower = search.toLowerCase();
    const searchMatch = (
      p.systemCode.toLowerCase().includes(searchLower) ||
      p.systemName?.toLowerCase().includes(searchLower)
    );

    if (filter.size === 0) return searchMatch;

    const statusMatches = [];
    if (filter.has("NOT_STARTED") && p.status === "NOT_STARTED") statusMatches.push(true);
    if (filter.has("IN_PROGRESS") && p.status === "IN_PROGRESS") statusMatches.push(true);
    if (filter.has("COMPLETED") && p.status === "COMPLETED") statusMatches.push(true);
    if (filter.has("APPROVED") && p.status === "APPROVED") statusMatches.push(true);

    return searchMatch && statusMatches.length > 0;
  });

  async function handleGenerateProtocols() {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/mc-protocols`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Kunne ikke generere protokoller (ukjent feil)");
      }

      const data = await res.json();
      toast.success(data.message || "Protokoller generert");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "Noe gikk galt under generering");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Protokoller MC</h1>
          <p className="text-muted-foreground">
            Oversikt over mekanisk komplettering per system
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowGenerateConfirm(true)}
            disabled={isGenerating}
          >
            {isGenerating ? "Genererer..." : "Generer/Oppdater Protokoller"}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
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
            { label: "Godkjent", value: "APPROVED" },
          ]}
          selectedValues={filter}
          onSelectionChange={setFilter}
        />
      </div>

      {protocols.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardCheck size={48} className="mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">
              Ingen protokoller
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Trykk på "Generer/Oppdater Protokoller" for å opprette protokoller basert på masselisten.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProtocols.map((protocol) => (
            <Card
              key={protocol.id}
              className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm"
              onClick={() =>
                router.push(
                  `/syslink/projects/${project.id}/protocols/${protocol.id}`
                )
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="font-mono">
                    {protocol.systemCode}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={protocol.status} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProtocolToDelete(protocol.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <CardTitle className="leading-snug">
                  {protocol.systemName || `System ${protocol.systemCode}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fremdrift</span>
                      <span className="font-medium">
                        {protocol.stats.progress}%
                      </span>
                    </div>
                    <Progress
                      value={protocol.stats.progress}
                      className="h-2"
                      indicatorColor={getProgressColor(protocol.stats.progress)}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText size={12} />
                      {protocol.stats.completedItems} / {protocol.stats.totalItems} punkter
                    </span>
                    <ArrowRight size={14} className="opacity-50" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!protocolToDelete} onOpenChange={(open) => !open && setProtocolToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slett protokoll</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil slette denne protokollen? Dette vil slette alle registrerte data og koblinger i protokollen. Handlingen kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProtocolToDelete(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => protocolToDelete && handleDelete(protocolToDelete)}
            >
              Slett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generer/Oppdater Protokoller</DialogTitle>
            <DialogDescription>
              Dette vil skanne alle dokumenter i prosjektet og opprette eller oppdatere MC-protokoller basert på systemkoder (f.eks. =3601.009). Eksisterende data vil ikke bli overskrevet, men nye linjer kan legges til. Vil du fortsette?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateConfirm(false)}>
              Avbryt
            </Button>
            <Button
              onClick={() => {
                setShowGenerateConfirm(false);
                handleGenerateProtocols();
              }}
            >
              Oppdater
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":
      return (
        <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/25 border-green-200">
          Fullført
        </Badge>
      );
    case "IN_PROGRESS":
      return (
        <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 border-blue-200">
          Pågår
        </Badge>
      );
    case "APPROVED":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200">
          Godkjent
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          Ikke startet
        </Badge>
      );
  }
}
