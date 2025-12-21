"use client";

import { HelpCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    iconSize?: number;
}

/**
 * Reusable help icon with popup dialog
 */
export function HelpTooltip({ title, children, className, iconSize = 16 }: HelpTooltipProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 rounded-full hover:bg-muted", className)}
                    title="Hjelp"
                >
                    <HelpCircle size={iconSize} className="text-muted-foreground hover:text-foreground" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <HelpCircle size={20} className="text-blue-500" />
                        {title}
                    </DialogTitle>
                </DialogHeader>
                <DialogDescription asChild>
                    <div className="text-sm text-foreground space-y-3">
                        {children}
                    </div>
                </DialogDescription>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Help content for Arbeidstegninger/Systemskjema upload area
 */
export function DocumentUploadHelp() {
    return (
        <HelpTooltip title="Om dokumenter">
            <div className="space-y-4">
                <div>
                    <h4 className="font-medium text-foreground mb-1">📤 Opplasting</h4>
                    <p className="text-muted-foreground">
                        Last opp PDF-filer av arbeidstegninger eller systemskjema. Systemet vil automatisk
                        forsøke å finne og tagge systemkoder.
                    </p>
                </div>

                <div>
                    <h4 className="font-medium text-foreground mb-1">🔍 Automatisk skanning</h4>
                    <p className="text-muted-foreground">
                        Etter opplasting scannes dokumentet for systemkoder (f.eks. 360.001) og komponenter
                        (f.eks. RTA4001).
                    </p>
                </div>

                <div>
                    <h4 className="font-medium text-foreground mb-1">📋 Handlinger</h4>
                    <ul className="text-muted-foreground list-disc list-inside space-y-1">
                        <li><strong>Skann for systemer</strong> – Finn systemkoder i dokumentet</li>
                        <li><strong>Vis komponenter</strong> – Se alle komponenter funnet</li>
                        <li><strong>Verifiser mot masseliste</strong> – Sjekk mot prosjektets masseliste</li>
                        <li><strong>Generer protokoller</strong> – Opprett MC-protokoller automatisk</li>
                    </ul>
                </div>

                <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground italic">
                        Tips: Klikk på et dokument for å åpne PDF-viseren med flere verktøy.
                    </p>
                </div>
            </div>
        </HelpTooltip>
    );
}

/**
 * Help content for PDF Viewer
 */
export function PDFViewerHelp() {
    return (
        <HelpTooltip title="PDF Viewer funksjoner" iconSize={18}>
            <div className="space-y-4">
                <div>
                    <h4 className="font-medium text-foreground mb-1">🔎 Navigasjon</h4>
                    <ul className="text-muted-foreground list-disc list-inside space-y-1">
                        <li><strong>Zoom</strong> – Bruk +/- eller scroll med Ctrl</li>
                        <li><strong>Panorer</strong> – Klikk og dra for å flytte</li>
                        <li><strong>Sidenavigasjon</strong> – Piltaster eller klikk på sideminiatyrer</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-medium text-foreground mb-1">📍 Annoteringer</h4>
                    <ul className="text-muted-foreground list-disc list-inside space-y-1">
                        <li><strong>Marker komponent</strong> – Tegn et rektangel rundt en komponent</li>
                        <li><strong>Marker system</strong> – Tegn rundt en systemkode</li>
                        <li><strong>Kommentarer</strong> – Legg til notater på dokumentet</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-medium text-foreground mb-1">⚡ Verktøy</h4>
                    <ul className="text-muted-foreground list-disc list-inside space-y-1">
                        <li><strong>Skann komponenter</strong> – Automatisk finn komponenter</li>
                        <li><strong>Verifisering</strong> – Sammenlign med masseliste</li>
                        <li><strong>Navigasjon</strong> – Hopp til markerte elementer</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-medium text-foreground mb-1">⌨️ Hurtigtaster</h4>
                    <ul className="text-muted-foreground list-disc list-inside space-y-1">
                        <li><strong>Esc</strong> – Avbryt tegning / lukk verktøy</li>
                        <li><strong>← →</strong> – Forrige/neste side</li>
                        <li><strong>Ctrl + Scroll</strong> – Zoom</li>
                    </ul>
                </div>
            </div>
        </HelpTooltip>
    );
}
