"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VerificationResult {
    totalComponents: number;
    matchedComponents: number;
    totalInMassList: number;
    matches: Array<{
        component: { code: string; system: string | null };
        massListItem: { tfm: string | null; component: string | null; system: string | null };
    }>;
    missingInDrawing: Array<{ tfm: string | null; component: string | null; system: string | null }>;
    unmatchedComponents: Array<{ code: string; system: string | null }>;
}

interface VerificationMatrixProps {
    isOpen: boolean;
    onClose: () => void;
    result: VerificationResult | null;
    isLoading: boolean;
}

export default function VerificationMatrix({
    isOpen,
    onClose,
    result,
    isLoading,
}: VerificationMatrixProps) {
    if (!result && !isLoading) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
                    <DialogTitle>Verifisering mot Masseliste</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center flex-1">
                        <p className="text-muted-foreground">Analyserer dokument...</p>
                    </div>
                ) : result ? (
                    <div className="flex flex-col flex-1 overflow-hidden gap-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-muted p-4 rounded-lg text-center">
                                <p className="text-sm text-muted-foreground">Funnet i tegning</p>
                                <p className="text-2xl font-bold">{result.totalComponents}</p>
                            </div>
                            <div className="bg-muted p-4 rounded-lg text-center">
                                <p className="text-sm text-muted-foreground">Matcher</p>
                                <p className="text-2xl font-bold text-green-500">
                                    {result.matchedComponents}
                                </p>
                            </div>
                            <div className="bg-muted p-4 rounded-lg text-center">
                                <p className="text-sm text-muted-foreground">Avvik</p>
                                <p className="text-2xl font-bold text-red-500">
                                    {result.unmatchedComponents.length + result.missingInDrawing.length}
                                </p>
                            </div>
                        </div>

                        <Tabs defaultValue="matches" className="flex-1 flex flex-col overflow-hidden">
                            <TabsList>
                                <TabsTrigger value="matches">Matcher ({result.matches.length})</TabsTrigger>
                                <TabsTrigger value="missing-drawing">
                                    Mangler i tegning ({result.missingInDrawing.length})
                                </TabsTrigger>
                                <TabsTrigger value="missing-list">
                                    Mangler i liste ({result.unmatchedComponents.length})
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="matches" className="flex-1 overflow-hidden mt-2">
                                <ScrollArea className="h-full border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Komponent (Tegning)</TableHead>
                                                <TableHead>Masseliste (TFM)</TableHead>
                                                <TableHead>System</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.matches.map((match, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-mono">{match.component.code}</TableCell>
                                                    <TableCell className="font-mono">
                                                        {match.massListItem.tfm || match.massListItem.component}
                                                    </TableCell>
                                                    <TableCell>{match.component.system}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                                            <CheckCircle size={12} className="mr-1" /> OK
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="missing-drawing" className="flex-1 overflow-hidden mt-2">
                                <ScrollArea className="h-full border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>TFM / Komponent</TableHead>
                                                <TableHead>System</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.missingInDrawing.map((item, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-mono">
                                                        {item.tfm || item.component}
                                                    </TableCell>
                                                    <TableCell>{item.system}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="destructive">
                                                            <XCircle size={12} className="mr-1" /> Mangler i tegning
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="missing-list" className="flex-1 overflow-hidden mt-2">
                                <ScrollArea className="h-full border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Komponent kode</TableHead>
                                                <TableHead>System</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.unmatchedComponents.map((comp, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-mono">{comp.code}</TableCell>
                                                    <TableCell>{comp.system}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="destructive">
                                                            <AlertTriangle size={12} className="mr-1" /> Ukjent i liste
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
