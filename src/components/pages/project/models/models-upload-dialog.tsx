"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, CheckCircle2, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ModelsUploadDialogProps {
  projectId: string;
  onUploadComplete: () => void;
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

function isSupportedModelFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".ifc") || lower.endsWith(".rvt") || lower.endsWith(".bim");
}

export function ModelsUploadDialog({ projectId, onUploadComplete }: ModelsUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [modelId, setModelId] = useState<string | null>(null);
  const [conversionStatus, setConversionStatus] = useState<
    "UPLOADING" | "CONVERTING" | "READY" | "ERROR" | null
  >(null);
  const [conversionProgress, setConversionProgress] = useState<number | null>(null);
  const [conversionStage, setConversionStage] = useState<string | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const conversionNotifiedRef = useRef(false);

  const fileLabel = useMemo(() => {
    if (!selectedFile) return null;
    return `${selectedFile.name} • ${formatFileSize(selectedFile.size)}`;
  }, [selectedFile]);

  const isConverting = Boolean(modelId && conversionStatus === "CONVERTING");

  useEffect(() => {
    if (!open || !modelId) return;

    if (conversionStatus === "READY" || conversionStatus === "ERROR") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/models/${modelId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as any;
        if (cancelled) return;

        const nextStatus = typeof data?.status === "string" ? (data.status as string) : null;
        if (nextStatus === "UPLOADING" || nextStatus === "CONVERTING" || nextStatus === "READY" || nextStatus === "ERROR") {
          setConversionStatus(nextStatus);
        }

        setConversionError(typeof data?.errorMessage === "string" ? data.errorMessage : null);

        const progressObj = data?.metadata?.progress;
        if (typeof progressObj === "number") {
          setConversionProgress(progressObj);
        } else if (typeof progressObj?.percent === "number") {
          setConversionProgress(progressObj.percent);
        } else {
          setConversionProgress(null);
        }

        const stage = progressObj?.stage ?? data?.metadata?.stage;
        setConversionStage(typeof stage === "string" ? stage : null);

        if ((nextStatus === "READY" || nextStatus === "ERROR") && !conversionNotifiedRef.current) {
          conversionNotifiedRef.current = true;
          onUploadComplete();

          if (nextStatus === "READY") {
            toast.success("Modell er klar");
            setOpen(false);
          } else {
            toast.error(typeof data?.errorMessage === "string" ? data.errorMessage : "Konvertering feilet");
          }
        }
      } catch {
        // Ignore transient polling errors.
      }
    };

    void poll();

    const interval = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversionStatus, modelId, onUploadComplete, open, projectId]);

  function resetState() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setSelectedFile(null);
    setModelName("");
    setUploading(false);
    setUploadProgress(0);
    setDragActive(false);
    setModelId(null);
    setConversionStatus(null);
    setConversionProgress(null);
    setConversionStage(null);
    setConversionError(null);
    conversionNotifiedRef.current = false;
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleFileSelect(file: File) {
    if (uploading || isConverting) return;
    if (!isSupportedModelFile(file)) {
      toast.error("Kun IFC/RVT/BIM-filer er støttet");
      return;
    }

    setSelectedFile(file);
    setModelName(file.name.replace(/\.[^.]+$/, ""));
    setUploadProgress(0);
    setModelId(null);
    setConversionStatus(null);
    setConversionProgress(null);
    setConversionStage(null);
    setConversionError(null);
    conversionNotifiedRef.current = false;
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setUploading(false);
    setUploadProgress(0);
    toast.info("Opplasting avbrutt");
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (uploading || isConverting) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (modelName.trim()) formData.append("name", modelName.trim());

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open("POST", `/api/projects/${projectId}/models`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      setUploadProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      setUploading(false);
      xhrRef.current = null;

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (typeof data?.id === "string") {
            setModelId(data.id);
            setConversionStatus(typeof data?.status === "string" ? data.status : "CONVERTING");
            conversionNotifiedRef.current = false;
          }
        } catch {
          // If parsing fails, fall back to list refresh.
        }
        toast.success("Modell lastet opp. Konvertering starter...");
        onUploadComplete();
        return;
      }

      try {
        const data = JSON.parse(xhr.responseText);
        toast.error(data?.error || "Opplasting feilet");
      } catch {
        toast.error("Opplasting feilet");
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      xhrRef.current = null;
      toast.error("Opplasting feilet");
    };

    xhr.onabort = () => {
      setUploading(false);
      xhrRef.current = null;
    };

    xhr.send(formData);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState();
        setOpen(next);
      }}
    >
      <Button type="button" onClick={() => setOpen(true)} className="self-start sm:self-auto">
        <Plus className="h-4 w-4 mr-1" />
        Last opp ny
      </Button>

      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            Last opp modell
          </DialogTitle>
          <DialogDescription>
            Dra inn en modellfil og bekreft opplasting. IFC støttes nå (RVT/BIM er klargjort for senere konvertering).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleChange}
            accept=".ifc,.rvt,.bim"
          />

          <div
            className={cn(
              "rounded-xl border border-dashed p-8 transition-colors",
              "bg-muted/20",
              dragActive ? "border-primary bg-primary/5" : "border-border",
              uploading || isConverting ? "opacity-75 pointer-events-none" : "cursor-pointer"
            )}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Last opp modell"
          >
            <div className="flex flex-col items-center text-center gap-2">
              <div className="text-sm font-medium">
                Dra og slipp fil her, eller klikk for å velge
              </div>
              <div className="text-xs text-muted-foreground">.ifc, .rvt, .bim</div>
              <div className="text-xs text-muted-foreground">Maks 500 MB</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Modellnavn</div>
              {fileLabel ? (
                <div className="text-xs text-muted-foreground truncate">{fileLabel}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Hovedmodell_A401"
                disabled={!selectedFile || uploading || isConverting}
              />
              {selectedFile && !uploading && !isConverting ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setSelectedFile(null);
                    setModelName("");
                    setUploadProgress(0);
                  }}
                  aria-label="Fjern fil"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="text-muted-foreground">Status</div>
              {uploading ? (
                <div className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Laster opp... {uploadProgress}%
                </div>
              ) : isConverting ? (
                <div className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Konverterer... {conversionProgress ?? 0}%
                </div>
              ) : conversionStatus === "READY" ? (
                <div className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Klar
                </div>
              ) : conversionStatus === "ERROR" ? (
                <div className="inline-flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Feil
                </div>
              ) : (
                <div className="text-muted-foreground">Velg en fil for å starte</div>
              )}
            </div>

            {isConverting && conversionStage ? (
              <div className="text-xs text-muted-foreground">{conversionStage}</div>
            ) : null}

            {conversionStatus === "ERROR" && conversionError ? (
              <div className="text-xs text-destructive">{conversionError}</div>
            ) : null}

            <Progress
              value={uploading ? uploadProgress : isConverting ? conversionProgress ?? 0 : conversionStatus === "READY" ? 100 : 0}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (uploading) {
                  cancelUpload();
                  return;
                }
                setOpen(false);
              }}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading || isConverting}
            >
              <Upload className="h-4 w-4 mr-1" />
              Bekreft
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
