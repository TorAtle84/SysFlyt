"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertTriangle, Clock, Coins, FileText, Key, BrainCircuit } from "lucide-react";

interface AnalysisSummaryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    analysis: {
        id: string;
        status: string;
        startedAt: string;
        completedAt: string | null;
        tokensUsed: number;
        apiCostNok: number;
        geminiCostUsd: number;
        openaiCostUsd: number;
        activeKeys: string | null;
        _count: {
            files: number;
            requirements: number;
        };
    } | null;
}

export function AnalysisSummary({ open, onOpenChange, analysis }: AnalysisSummaryProps) {
    if (!analysis) return null;

    const duration = analysis.completedAt
        ? Math.round((new Date(analysis.completedAt).getTime() - new Date(analysis.startedAt).getTime()) / 1000)
        : 0;

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    const activeKeys = analysis.activeKeys ? JSON.parse(analysis.activeKeys) : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {analysis.status === "COMPLETED" ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        )}
                        Analyseoppsummering
                    </DialogTitle>
                    <DialogDescription>
                        Detaljer for analyse utført {new Date(analysis.startedAt).toLocaleDateString("nb-NO")} kl. {new Date(analysis.startedAt).toLocaleTimeString("nb-NO")}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 py-4">
                    {/* Key Metrics */}
                    <div className="space-y-4">
                        <div className="rounded-lg bg-muted p-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <FileText className="h-4 w-4" />
                                <span>Funn</span>
                            </div>
                            <div className="text-2xl font-bold">{analysis._count.requirements} passasjer</div>
                            <p className="text-xs text-muted-foreground">Analysert fra {analysis._count.files} filer</p>
                        </div>

                        <div className="rounded-lg bg-muted p-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Clock className="h-4 w-4" />
                                <span>Tidsbruk</span>
                            </div>
                            <div className="text-2xl font-bold">{minutes}m {seconds}s</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-lg bg-muted p-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Coins className="h-4 w-4" />
                                <span>Total Kostnad</span>
                            </div>
                            <div className="text-2xl font-bold">{analysis.apiCostNok.toFixed(2)} NOK</div>
                            <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                                <span title="Gemini Cost">G: ${analysis.geminiCostUsd.toFixed(4)}</span>
                                <span title="OpenAI Cost">O: ${analysis.openaiCostUsd.toFixed(4)}</span>
                            </div>
                        </div>

                        <div className="rounded-lg bg-muted p-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <BrainCircuit className="h-4 w-4" />
                                <span>AI Forbruk</span>
                            </div>
                            <div className="text-lg font-semibold">{analysis.tokensUsed.toLocaleString()} tokens</div>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {activeKeys.includes("gemini") && (
                                    <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 hover:bg-green-500/20">Gemini</Badge>
                                )}
                                {activeKeys.includes("openai") && (
                                    <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-700 hover:bg-blue-500/20">OpenAI</Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="space-y-2">
                    <h4 className="text-sm font-medium">Resultat</h4>
                    {analysis._count.requirements === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Ingen krav eller relevante passasjer ble funnet. Dette kan skyldes at dokumentene er skannet (bilder) uten tekstlag, eller at innholdet ikke matchet søkekriteriene.
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {analysis._count.requirements} krav er identifisert og lagt til i prosjektet. Du kan se gjennom og redigere disse i "Krav"-fanen.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Lukk</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
