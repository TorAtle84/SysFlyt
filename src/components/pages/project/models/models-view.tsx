"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AlertTriangle, Eye, Grid3X3, List, ListTree, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ModelComponentsModal } from "./model-components-modal";
import { ModelViewerModal } from "./model-viewer-modal";
import type { BimModelListItem } from "./types";

interface ModelsViewProps {
  projectId: string;
  models: BimModelListItem[];
  loading: boolean;
  onModelsChanged: () => void;
  initialOpenModelId?: string | null;
  initialFullTag?: string | null;
  initialSessionId?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function statusBadge(status: BimModelListItem["status"]) {
  switch (status) {
    case "READY":
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Klar</Badge>;
    case "CONVERTING":
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">Konverterer</Badge>;
    case "UPLOADING":
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300">Laster opp</Badge>;
    case "ERROR":
      return <Badge className="bg-destructive/15 text-destructive">Feil</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function ModelsView({
  projectId,
  models,
  loading,
  onModelsChanged,
  initialOpenModelId,
  initialFullTag,
  initialSessionId,
}: ModelsViewProps) {
  const [view, setView] = useState<"grid" | "list">("list");
  const [query, setQuery] = useState("");
  const [viewerState, setViewerState] = useState<{
    modelId: string;
    initialFullTag?: string;
    sessionId?: string;
  } | null>(
    initialOpenModelId
      ? {
          modelId: initialOpenModelId,
          initialFullTag: initialFullTag || undefined,
          sessionId: initialSessionId || undefined,
        }
      : null
  );
  const [componentsModal, setComponentsModal] = useState<{ modelId: string; modelName: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => {
      return (
        m.name.toLowerCase().includes(q) ||
        m.fileName.toLowerCase().includes(q) ||
        m.format.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      );
    });
  }, [models, query]);

  async function handleDelete(modelId: string) {
    if (!confirm("Slette modellen? Dette kan ikke angres.")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/models/${modelId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Kunne ikke slette modell");
      }
      toast.success("Modell slettet");
      onModelsChanged();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Kunne ikke slette modell");
    }
  }

  function openViewer(modelId: string, opts?: { fullTag?: string; sessionId?: string }) {
    setViewerState({
      modelId,
      initialFullTag: opts?.fullTag,
      sessionId: opts?.sessionId,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i modeller..."
            className="sm:w-[340px]"
          />
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(view === "grid" && "bg-muted")}
              onClick={() => setView("grid")}
              aria-label="Gridvisning"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(view === "list" && "bg-muted")}
              onClick={() => setView("list")}
              aria-label="Listevisning"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {loading ? "Laster..." : `${filtered.length} av ${models.length}`}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laster modeller...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Ingen modeller matcher søket.
          </CardContent>
        </Card>
      ) : (
        <AnimatePresence mode="popLayout">
          {view === "grid" ? (
            <motion.div
              key="grid"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              {filtered.map((model) => (
                <motion.div key={model.id} layout>
                  <Card className="h-full">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{model.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{model.fileName}</div>
                        </div>
                        {statusBadge(model.status)}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{model.format}</Badge>
                        <span>{formatFileSize(model.fileSize)}</span>
                        <span>•</span>
                        <span>{model._count?.components ?? 0} komponenter</span>
                      </div>

                      {model.status === "ERROR" && (
                        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                          <AlertTriangle className="mt-0.5 h-4 w-4" />
                          <div className="min-w-0">
                            <div className="font-medium">Feil ved konvertering</div>
                            <div className="text-destructive/80 truncate">
                              {model.errorMessage || "Ukjent feil"}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openViewer(model.id)}
                          disabled={model.status !== "READY"}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Åpne
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setComponentsModal({ modelId: model.id, modelName: model.name })}
                          disabled={model.status !== "READY"}
                        >
                          <ListTree className="h-4 w-4 mr-1" />
                          Komponenter
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(model.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Slett
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="space-y-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              {filtered.map((model) => (
                <motion.div key={model.id} layout>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold truncate">{model.name}</div>
                            {statusBadge(model.status)}
                            <Badge variant="secondary">{model.format}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{model.fileName}</div>
                          <div className="text-sm text-muted-foreground">
                            Lastet opp: {format(new Date(model.createdAt), "d. MMM yyyy", { locale: nb })}
                            {model.uploadedBy ? ` av ${model.uploadedBy.firstName} ${model.uploadedBy.lastName}` : ""}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Størrelse: {formatFileSize(model.fileSize)} • Komponenter funnet: {model._count?.components ?? 0}
                          </div>

                          {model.status === "ERROR" && (
                            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive mt-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4" />
                              <div className="min-w-0">
                                <div className="font-medium">Feil ved konvertering</div>
                                <div className="text-destructive/80 truncate">
                                  {model.errorMessage || "Ukjent feil"}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openViewer(model.id)}
                            disabled={model.status !== "READY"}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Åpne viewer
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setComponentsModal({ modelId: model.id, modelName: model.name })}
                            disabled={model.status !== "READY"}
                          >
                            <ListTree className="h-4 w-4 mr-1" />
                            Se komponentliste
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(model.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Slett
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <ModelViewerModal
        open={!!viewerState}
        onOpenChange={(open) => !open && setViewerState(null)}
        projectId={projectId}
        modelId={viewerState?.modelId || null}
        initialFullTag={viewerState?.initialFullTag}
        sessionId={viewerState?.sessionId}
      />

      <ModelComponentsModal
        open={!!componentsModal}
        onOpenChange={(open) => !open && setComponentsModal(null)}
        projectId={projectId}
        modelId={componentsModal?.modelId || null}
        modelName={componentsModal?.modelName || null}
        onOpenViewer={(fullTag) => {
          if (!componentsModal?.modelId) return;
          const modelId = componentsModal.modelId;
          setComponentsModal(null);
          openViewer(modelId, { fullTag });
        }}
      />
    </div>
  );
}

