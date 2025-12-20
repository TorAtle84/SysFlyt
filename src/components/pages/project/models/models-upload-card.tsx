"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, Box, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ModelsUploadCardProps {
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

export function ModelsUploadCard({ projectId, onUploadComplete }: ModelsUploadCardProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const fileLabel = useMemo(() => {
    if (!selectedFile) return null;
    return `${selectedFile.name} • ${formatFileSize(selectedFile.size)}`;
  }, [selectedFile]);

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
    if (!isSupportedModelFile(file)) {
      toast.error("Kun IFC/RVT/BIM-filer er støttet");
      return;
    }

    setSelectedFile(file);
    setModelName(file.name.replace(/\.[^.]+$/, ""));
    setUploadProgress(0);
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
        toast.success("Modell lastet opp. Konvertering starter...");
        setSelectedFile(null);
        setModelName("");
        setUploadProgress(0);
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
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Box className="text-primary" size={20} />
                Last opp 3D-modell
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                IFC støttes nå. RVT/BIM er klargjort for senere konvertering.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" />
              Velg fil
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={handleChange}
              accept=".ifc,.rvt,.bim"
            />
          </div>

          <div
            className={cn(
              "rounded-xl border border-dashed p-6 transition-colors",
              "bg-muted/20",
              dragActive ? "border-primary bg-primary/5" : "border-border",
              uploading ? "opacity-75 pointer-events-none" : "cursor-pointer"
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
              <div className="text-sm font-medium">Dra og slipp her</div>
              <div className="text-xs text-muted-foreground">Støtter .ifc, .rvt, .bim</div>
            </div>
          </div>

          {selectedFile && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{fileLabel}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Gi modellen et navn (valgfritt)
                  </div>
                </div>
                {!uploading ? (
                  <Button
                    variant="ghost"
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

              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Modellnavn"
                disabled={uploading}
              />

              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Laster opp...
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                {uploading ? (
                  <Button variant="outline" onClick={cancelUpload}>
                    Avbryt
                  </Button>
                ) : (
                  <Button onClick={handleUpload}>
                    <Upload className="h-4 w-4 mr-1" />
                    Last opp
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
