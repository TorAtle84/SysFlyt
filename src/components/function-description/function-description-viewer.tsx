"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import PDFToolbar, { Tool } from "@/components/pdf-viewer/pdf-toolbar";
import AnnotationLayer from "@/components/pdf-viewer/annotation-layer";
import SaveAndCloseButton from "@/components/pdf-viewer/save-and-close-button";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Point {
    x: number;
    y: number;
}

interface SystemAnnotation {
    id: string;
    type: "SYSTEM" | "COMMENT";
    systemCode?: string;
    content?: string;
    mentions?: string[];
    points?: Point[];
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color: string;
    pageNumber: number;
}

interface FunctionDescriptionViewerProps {
    url: string;
    systemTags: string[];
    documentId: string;
    projectId: string;
    initialSystemAnnotations: SystemAnnotation[];
    canEdit?: boolean;
    initialPage?: number;
}

export default function FunctionDescriptionViewer({
    url,
    systemTags,
    documentId,
    projectId,
    initialSystemAnnotations,
    canEdit = true,
    initialPage,
}: FunctionDescriptionViewerProps) {
    // View State
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(initialPage || 1);
    const [scale, setScale] = useState(1.0);
    const [loading, setLoading] = useState(true);
    const [activeTool, setActiveTool] = useState<Tool>("cursor");

    // Page dimensions for AnnotationLayer
    const [pageWidth, setPageWidth] = useState(0);
    const [pageHeight, setPageHeight] = useState(0);

    // Annotation State
    const [systemAnnotations] = useState<SystemAnnotation[]>(initialSystemAnnotations);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | undefined>();

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [allSearchMatches, setAllSearchMatches] = useState<Array<{ page: number; x: number; y: number; width: number; height: number }>>([]);
    const [searchHighlights, setSearchHighlights] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);

    const containerRef = useRef<HTMLDivElement>(null);

    // Search Effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!searchQuery || searchQuery.length < 2) {
                setAllSearchMatches([]);
                return;
            }

            try {
                const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/search-pattern`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pattern: searchQuery }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setAllSearchMatches(data.matches || []);
                }
            } catch (err) {
                console.error("Search error:", err);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery, projectId, documentId]);

    // Update current page highlights based on search matches
    useEffect(() => {
        const matchesOnPage = allSearchMatches.filter((m) => m.page === pageNumber);
        setSearchHighlights(
            matchesOnPage.map((m) => ({
                x: m.x,
                y: m.y,
                width: m.width,
                height: m.height,
            }))
        );
    }, [allSearchMatches, pageNumber]);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        setLoading(false);
    }

    function onPageLoadSuccess(page: { width: number; height: number }) {
        setPageWidth(page.width);
        setPageHeight(page.height);
    }

    const handlePrevPage = () => {
        if (pageNumber > 1) {
            setPageNumber(pageNumber - 1);
        }
    };

    const handleNextPage = () => {
        if (pageNumber < (numPages || 1)) {
            setPageNumber(pageNumber + 1);
        }
    };

    const handleZoomIn = () => {
        setScale((s) => Math.min(s + 0.25, 5));
    };

    const handleZoomOut = () => {
        setScale((s) => Math.max(s - 0.25, 0.5));
    };

    const handleAnnotationClick = (id: string) => {
        setSelectedAnnotationId(id);
    };

    // Simple tool handler - only supports navigation/viewing tools
    const handleToolChange = (tool: Tool) => {
        if (tool === "polygon") {
            toast.info("Denne funksjonen er ikke tilgjengelig for funksjonsbeskrivelser");
            return;
        }
        setActiveTool(tool);
    };

    // Filter annotations for current page
    const pageAnnotations = systemAnnotations.filter((a) => a.pageNumber === pageNumber);

    return (
        <div className="flex h-screen flex-col bg-slate-100 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-border bg-white p-2 dark:bg-slate-950">
                <div className="flex items-center gap-4">
                    <SaveAndCloseButton projectId={projectId} documentId={documentId} systemTags={systemTags} />

                    {/* Simplified Toolbar */}
                    <PDFToolbar
                        pageNumber={pageNumber}
                        numPages={numPages}
                        scale={scale}
                        activeTool={activeTool}
                        showPolygons={false}
                        showMarkers={false}
                        systemTags={systemTags}
                        searchQuery={searchQuery}
                        canEdit={canEdit}
                        hasSelection={false}
                        onPrevPage={handlePrevPage}
                        onNextPage={handleNextPage}
                        onZoomIn={handleZoomIn}
                        onZoomOut={handleZoomOut}
                        onToolChange={handleToolChange}
                        onTogglePolygons={() => { }}
                        onToggleMarkers={() => { }}
                        onSearchChange={setSearchQuery}
                        onDeleteSelection={() => { }}
                    />
                </div>
            </div>

            <div className="relative flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900" ref={containerRef}>
                <div className="mx-auto w-fit shadow-lg">
                    <Document
                        file={url}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                            <div className="flex h-[800px] items-center justify-center bg-white">
                                <Loader2 className="animate-spin text-primary" size={48} />
                            </div>
                        }
                        error={
                            <div className="flex h-[800px] items-center justify-center bg-white text-destructive">
                                Kunne ikke laste PDF. Sjekk at filen eksisterer.
                            </div>
                        }
                    >
                        <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="bg-white relative"
                            onLoadSuccess={onPageLoadSuccess}
                        >
                            {/* Annotation Layer */}
                            <AnnotationLayer
                                pageNumber={pageNumber}
                                scale={scale}
                                pageWidth={pageWidth}
                                pageHeight={pageHeight}
                                systemAnnotations={pageAnnotations}
                                componentMarkers={[]}
                                searchHighlights={searchHighlights}
                                showPolygons={false}
                                showMarkers={false}
                                selectedAnnotationId={selectedAnnotationId}
                                moveSelection={new Set()}
                                onAnnotationClick={handleAnnotationClick}
                            />
                        </Page>
                    </Document>
                </div>
            </div>
        </div>
    );
}
