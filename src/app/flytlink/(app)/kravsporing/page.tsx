"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { FileSearch, Upload, X, FileText, File, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = {
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "text/plain": [".txt"],
    "application/vnd.ms-outlook": [".msg"],
};

function getFileIcon(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FileText className="h-8 w-8 text-red-500" />;
    if (["doc", "docx"].includes(ext || "")) return <FileText className="h-8 w-8 text-blue-500" />;
    if (["xls", "xlsx"].includes(ext || "")) return <FileText className="h-8 w-8 text-green-500" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
}

export default function KravsporingPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles((prev) => {
            const existing = new Set(prev.map((f) => f.name));
            const newFiles = acceptedFiles.filter((f) => !existing.has(f.name));
            return [...prev, ...newFiles];
        });
        setError(null);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPTED_TYPES,
        maxFiles: 50,
        maxSize: 50 * 1024 * 1024, // 50MB per file
    });

    const removeFile = (fileName: string) => {
        setFiles((prev) => prev.filter((f) => f.name !== fileName));
    };

    const handleAnalyze = async () => {
        if (files.length === 0) {
            toast.error("Velg minst én fil å analysere");
            return;
        }

        setAnalyzing(true);
        setProgress(0);
        setError(null);

        try {
            // Simulate progress for now
            const interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) {
                        clearInterval(interval);
                        return prev;
                    }
                    return prev + Math.random() * 10;
                });
            }, 500);

            // TODO: Implement actual API call to analyze files
            await new Promise((resolve) => setTimeout(resolve, 3000));

            clearInterval(interval);
            setProgress(100);
            toast.success("Analyse fullført!");

            // TODO: Navigate to results page
        } catch (err) {
            setError(err instanceof Error ? err.message : "En feil oppstod under analysen");
            toast.error("Analyse feilet");
        } finally {
            setAnalyzing(false);
        }
    };

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <FileSearch className="h-8 w-8 text-primary" />
                    Kravsporing
                </h1>
                <p className="text-muted-foreground">
                    Last opp prosjektdokumenter for automatisk analyse og identifisering av krav
                </p>
            </div>

            {/* Upload Area */}
            <Card>
                <CardHeader>
                    <CardTitle>Last opp dokumenter</CardTitle>
                    <CardDescription>
                        Støttede formater: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), TXT, MSG
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div
                        {...getRootProps()}
                        className={cn(
                            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
                            isDragActive
                                ? "border-primary bg-primary/5"
                                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                        )}
                    >
                        <input {...getInputProps()} />
                        <Upload className={cn("h-12 w-12 mb-4", isDragActive ? "text-primary" : "text-muted-foreground")} />
                        <p className="text-center text-sm text-muted-foreground">
                            {isDragActive ? (
                                <span className="text-primary font-medium">Slipp filene her...</span>
                            ) : (
                                <>
                                    <span className="font-medium">Dra og slipp filer her</span>
                                    <br />
                                    eller klikk for å velge
                                </>
                            )}
                        </p>
                    </div>

                    {/* File List */}
                    {files.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <span>{files.length} fil(er) valgt</span>
                                <span>{totalSizeMB} MB</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto space-y-2">
                                {files.map((file) => (
                                    <div
                                        key={file.name}
                                        className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3"
                                    >
                                        {getFileIcon(file.name)}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => removeFile(file.name)}
                                            disabled={analyzing}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {analyzing && (
                        <div className="space-y-2">
                            <Progress value={progress} className="h-2" />
                            <p className="text-sm text-muted-foreground text-center">
                                Analyserer dokumenter... {Math.round(progress)}%
                            </p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setFiles([])}
                            disabled={files.length === 0 || analyzing}
                        >
                            Fjern alle
                        </Button>
                        <Button
                            onClick={handleAnalyze}
                            disabled={files.length === 0 || analyzing}
                            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                        >
                            {analyzing ? "Analyserer..." : "Start analyse"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="border-border/50 bg-card/50">
                <CardHeader>
                    <CardTitle className="text-lg">Tips for beste resultater</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                        <li>Last opp funksjonsbeskrivelser, tekniske spesifikasjoner, og kravdokumenter</li>
                        <li>PDF-filer med søkbar tekst gir best resultat</li>
                        <li>Systemskjemaer og tegninger blir også analysert for referanser</li>
                        <li>Du kan laste opp opptil 50 filer (maks 50 MB per fil)</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
