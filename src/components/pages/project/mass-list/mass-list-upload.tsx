"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface MassListUploadProps {
  projectId: string;
  onUploadComplete: () => void;
}

export function MassListUpload({ projectId, onUploadComplete }: MassListUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Kun Excel-filer (.xlsx, .xls) er tillatt");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/projects/${projectId}/mass-list`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Opplasting feilet");
      }

      onUploadComplete();
    } catch (err: any) {
      setError(err.message || "En feil oppstod under opplasting");
    } finally {
      setUploading(false);
    }
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div
          className={`relative rounded-xl border-2 border-dashed transition-colors ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleChange}
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={uploading}
          />
          <div className="flex flex-col items-center justify-center py-10">
            {uploading ? (
              <>
                <Loader2 className="mb-4 animate-spin text-primary" size={48} />
                <p className="text-sm text-muted-foreground">
                  Laster opp og behandler fil...
                </p>
              </>
            ) : (
              <>
                <FileSpreadsheet className="mb-4 text-primary" size={48} />
                <p className="mb-2 font-medium text-foreground">
                  Dra og slipp Excel-fil her
                </p>
                <p className="mb-4 text-sm text-muted-foreground">
                  eller klikk for å velge fil
                </p>
                <Button
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload size={16} className="mr-2" />
                  Velg fil
                </Button>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-red-500">{error}</p>
        )}

        <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Forventet format:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Kolonne A: TFM-kode (f.eks. 360.1, 420.5)</li>
            <li>Kolonne B: Beskrivelse</li>
            <li>Kolonne C: Mengde (valgfritt)</li>
            <li>Kolonne D: Enhet (valgfritt)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
