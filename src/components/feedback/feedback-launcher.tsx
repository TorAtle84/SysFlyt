"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { MessageSquare, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "SUGGESTION", label: "Forslag" },
  { value: "UI", label: "UI/UX" },
  { value: "PERFORMANCE", label: "Ytelse" },
  { value: "OTHER", label: "Annet" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Lav" },
  { value: "MEDIUM", label: "Normal" },
  { value: "HIGH", label: "Høy" },
  { value: "CRITICAL", label: "Kritisk" },
];

const ACCEPTED_IMAGE_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("BUG");
  const [priority, setPriority] = useState("MEDIUM");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}-${file.size}`));
      const next = acceptedFiles.filter((file) => !existing.has(`${file.name}-${file.size}`));
      return [...prev, ...next].slice(0, 5);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_IMAGE_TYPES,
    maxFiles: 5,
    maxSize: 5 * 1024 * 1024,
  });

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  function resetForm() {
    setCategory("BUG");
    setPriority("MEDIUM");
    setMessage("");
    setFiles([]);
  }

  async function handleSubmit() {
    if (message.trim().length < 10) {
      toast.error("Beskriv problemet litt mer (minst 10 tegn).");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("category", category);
      formData.append("priority", priority);
      formData.append("message", message.trim());
      files.forEach((file) => formData.append("attachments", file));

      const res = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunne ikke sende tilbakemelding");
      }

      toast.success("Takk! Tilbakemeldingen er registrert.");
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Noe gikk galt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="relative h-9 w-9 p-0"
        onClick={() => setOpen(true)}
        title="Send tilbakemelding"
      >
        <MessageSquare size={18} />
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Tilbakemelding</h3>
                <p className="text-sm text-muted-foreground">
                  Hjelp oss med forbedringer og feilretting.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioritet</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hva skjedde?</Label>
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Beskriv feilen eller forbedringsforslaget..."
                  className="min-h-[140px]"
                />
                <p className="text-xs text-muted-foreground">
                  Tips: inkluder hva du forventet og hva som faktisk skjedde.
                </p>
              </div>

              <div className="space-y-3">
                <Label>Vedlegg (bilder)</Label>
                <div
                  {...getRootProps()}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                    isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40"
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {isDragActive ? "Slipp bildene her..." : "Dra og slipp eller klikk for å velge"}
                  </p>
                  <p className="text-xs text-muted-foreground">Maks 5 bilder, 5MB per bilde</p>
                </div>

                {files.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{files.length} vedlegg</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setFiles([])}
                      >
                        Fjern alle
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {previews.map((preview) => (
                        <div key={preview.url} className="group relative rounded-lg border border-border bg-muted/20">
                          <img
                            src={preview.url}
                            alt={preview.file.name}
                            className="h-24 w-full rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() =>
                              setFiles((prev) => prev.filter((file) => file !== preview.file))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <Input
                            value={preview.file.name}
                            readOnly
                            className="h-8 border-0 bg-transparent text-xs text-muted-foreground"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-4 flex items-center justify-between">
              <Button variant="ghost" onClick={resetForm} disabled={submitting}>
                Nullstill
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send tilbakemelding
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
