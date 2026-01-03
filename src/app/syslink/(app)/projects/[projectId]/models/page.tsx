"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ModelsUploadDialog } from "@/components/pages/project/models/models-upload-dialog";
import { ModelsView } from "@/components/pages/project/models/models-view";
import type { BimModelListItem } from "@/components/pages/project/models/types";

export default function ModelsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const searchParams = useSearchParams();
  const [models, setModels] = useState<BimModelListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/models`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Kunne ikke hente modeller");
      }
      const data = (await res.json()) as any[];
      setModels(
        data.map((m) => ({
          ...m,
          createdAt: new Date(m.createdAt).toISOString(),
        }))
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Kunne ikke hente modeller");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // Poll while any model is converting/uploading
  useEffect(() => {
    const hasPending = models.some((m) => m.status === "UPLOADING" || m.status === "CONVERTING");
    if (!hasPending) return;

    const interval = window.setInterval(() => {
      void loadModels();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [models, loadModels]);

  const summary = useMemo(() => {
    const total = models.length;
    const ready = models.filter((m) => m.status === "READY").length;
    const converting = models.filter((m) => m.status === "CONVERTING" || m.status === "UPLOADING").length;
    const error = models.filter((m) => m.status === "ERROR").length;
    return { total, ready, converting, error };
  }, [models]);

  const initialModelId = searchParams.get("model");
  const initialFullTag = searchParams.get("tag");
  const initialSessionId = searchParams.get("session");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modeller</h1>
          <p className="text-muted-foreground">
            Last opp IFC/RVT og koble komponenter mot protokoll og tegninger.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <ModelsUploadDialog projectId={projectId} onUploadComplete={loadModels} />
          <div className="text-sm text-muted-foreground">
            {summary.total} modeller • {summary.ready} klare
            {summary.converting > 0 ? ` • ${summary.converting} jobber...` : ""}
            {summary.error > 0 ? ` • ${summary.error} feil` : ""}
          </div>
        </div>
      </div>

      <ModelsView
        projectId={projectId}
        models={models}
        loading={loading}
        onModelsChanged={loadModels}
        initialOpenModelId={initialModelId}
        initialFullTag={initialFullTag}
        initialSessionId={initialSessionId}
      />
    </div>
  );
}
