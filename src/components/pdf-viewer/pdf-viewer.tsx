"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import PDFToolbar, { Tool } from "./pdf-toolbar";
import AnnotationLayer from "./annotation-layer";
import SystemSelectionPopup from "./system-selection-popup";
import VerificationMatrix from "./verification-matrix";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

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

interface ComponentMarker {
  id: string;
  code: string;
  system: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  verifiedByText: boolean;
  page: number;
}

interface PDFViewerProps {
  url: string;
  systemTags: string[];
  documentId: string;
  projectId: string;
  initialSystemAnnotations: SystemAnnotation[];
  canEdit?: boolean;
  initialPage?: number;
  initialAnnotationId?: string;
  initialComponent?: string;
  initialX?: number;
  initialY?: number;
}

/**
 * Complete PDF Viewer with annotations, markers, polygons, and search
 */
export default function PDFViewer({
  url,
  systemTags,
  documentId,
  projectId,
  initialSystemAnnotations,
  canEdit = true,
  initialPage,
  initialAnnotationId,
  initialComponent,
  initialX,
  initialY,
}: PDFViewerProps) {
  const router = useRouter();

  // View State
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage || 1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<Tool>("cursor");

  // Annotation State
  const [systemAnnotations, setSystemAnnotations] = useState<SystemAnnotation[]>(
    initialSystemAnnotations
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | undefined>(
    initialAnnotationId
  );

  // Polygon Drawing State
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [showSystemPopup, setShowSystemPopup] = useState(false);

  // Component Markers State
  const [componentMarkers, setComponentMarkers] = useState<ComponentMarker[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showPolygons, setShowPolygons] = useState(true);
  const [hoveredMarker, setHoveredMarker] = useState<ComponentMarker | null>(null);
  const [moveSelection, setMoveSelection] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [allSearchMatches, setAllSearchMatches] = useState<Array<{ page: number; x: number; y: number; width: number; height: number }>>([]);
  const [searchHighlights, setSearchHighlights] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);

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
          console.log("[Search] Received matches:", data.matches?.length ?? 0, data.matches);
          setAllSearchMatches(data.matches || []);
        }
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 100); // Debounce 100ms - faster visual feedback

    return () => clearTimeout(timer);
  }, [searchQuery, documentId, projectId]);

  // Update highlights when page or matches change
  useEffect(() => {
    const pageMatches = allSearchMatches.filter(m => m.page === pageNumber);
    setSearchHighlights(pageMatches.map(m => ({
      x: m.x,
      y: m.y,
      width: m.width || 0, // Fallback if missing
      height: m.height || 0
    })));
  }, [allSearchMatches, pageNumber]);

  // Pan State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  // Verification State
  const [showVerificationMatrix, setShowVerificationMatrix] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Load component markers on page change
  useEffect(() => {
    async function loadMarkers() {
      const url = `/api/projects/${projectId}/documents/${documentId}/components/markers?page=${pageNumber}`;
      console.log("[PDFViewer] Fetching markers from:", url);
      try {
        const res = await fetch(url);
        console.log("[PDFViewer] Markers response status:", res.status);
        if (res.ok) {
          const data = await res.json();
          console.log("[PDFViewer] Markers received:", data.markers?.length ?? 0, data);
          setComponentMarkers(data.markers || []);
        } else {
          console.error("[PDFViewer] Markers fetch failed:", res.status, await res.text());
        }
      } catch (err) {
        console.error("Error loading markers:", err);
      }
    }

    loadMarkers();
  }, [documentId, projectId, pageNumber]);

  // Deep linking: Jump to component
  useEffect(() => {
    if (initialComponent && componentMarkers.length > 0) {
      const marker = componentMarkers.find((m) => m.code === initialComponent);
      if (marker) {
        console.log("Jump to component:", marker);
        // Highlight the marker
        setMoveSelection(new Set([marker.id]));

        // If we found the marker, we are on the right page (since we passed initialPage)
        // We could try to scroll, but marker elements might not be in DOM yet or easily selectable.
        // For now, highlighting it is a good start. 
        // We could also auto-zoom if needed.
      }
    }
  }, [initialComponent, componentMarkers]);

  // Deep linking: Jump to coordinates
  useEffect(() => {
    if (initialX !== undefined && initialY !== undefined) {
      // Scroll to coordinates
      console.log("Jump to coordinates:", initialX, initialY);
    }
  }, [initialX, initialY]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyboard(e: KeyboardEvent) {
      // Ctrl/Cmd + Scroll for zoom
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          handleZoomOut();
        }
      }

      // Arrow keys for navigation
      if (e.key === "ArrowLeft") {
        handlePrevPage();
      } else if (e.key === "ArrowRight") {
        handleNextPage();
      }

      // Tool shortcuts
      if (e.key === "Escape") {
        setActiveTool("cursor");
        setCurrentPoints([]);
        setMoveSelection(new Set());
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [pageNumber, numPages, scale]);

  // Mouse wheel zoom (Ctrl + Scroll)
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    }

    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
      return () => container.removeEventListener("wheel", handleWheel);
    }
  }, [scale]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function handlePrevPage() {
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
      setCurrentPoints([]);
      setMoveSelection(new Set());
    }
  }

  function handleNextPage() {
    if (pageNumber < (numPages || 1)) {
      setPageNumber(pageNumber + 1);
      setCurrentPoints([]);
      setMoveSelection(new Set());
    }
  }

  function handleZoomIn() {
    setScale((prev) => Math.min(prev + 0.1, 5.0));
  }

  function handleZoomOut() {
    setScale((prev) => Math.max(prev - 0.1, 0.5));
  }

  // Calculate mouse position in percentage coordinates
  function getMousePosition(e: React.MouseEvent): Point | null {
    if (!pageRef.current) return null;

    const rect = pageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    return { x, y };
  }

  // Handle page click based on active tool
  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    const pos = getMousePosition(e);
    if (!pos) return;

    switch (activeTool) {
      case "cursor":
        // Deselect
        setSelectedAnnotationId(undefined);
        setMoveSelection(new Set());
        break;

      case "polygon":
        // Add point to polygon
        const newPoints = [...currentPoints, pos];
        setCurrentPoints(newPoints);

        // Check if polygon is closed (clicked near first point)
        if (newPoints.length >= 3) {
          const first = newPoints[0];
          const dist = Math.sqrt(Math.pow(pos.x - first.x, 2) + Math.pow(pos.y - first.y, 2));
          if (dist < 2) {
            // Close polygon
            setShowSystemPopup(true);
          }
        }
        break;

      case "comment":
        // Create comment annotation
        handleCreateComment(pos);
        break;

      case "hand":
        // Pan mode - handled by mouse drag
        break;
    }
  }

  // Handle mouse down for pan and drag
  function handleMouseDown(e: React.MouseEvent) {
    if (activeTool === "hand") {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }

    if (moveSelection.size > 0 && activeTool === "cursor") {
      const pos = getMousePosition(e);
      if (pos) {
        setIsDragging(true);
        setDragStart(pos);
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;

      if (containerRef.current) {
        containerRef.current.scrollLeft -= dx;
        containerRef.current.scrollTop -= dy;
      }

      setPanStart({ x: e.clientX, y: e.clientY });
    }

    // Update cursor based on tool
    if (pageRef.current) {
      switch (activeTool) {
        case "hand":
          pageRef.current.style.cursor = isPanning ? "grabbing" : "grab";
          break;
        case "polygon":
          pageRef.current.style.cursor = "crosshair";
          break;
        case "comment":
          pageRef.current.style.cursor = "crosshair";
          break;
        default:
          pageRef.current.style.cursor = "default";
      }
    }
  }

  function handleMouseUp() {
    setIsPanning(false);
    setPanStart(null);

    if (isDragging && dragStart) {
      // Save new marker positions
      // This is simplified - in production you'd update via API
      setIsDragging(false);
      setDragStart(null);
    }
  }

  async function handleCreateComment(pos: Point) {
    if (!canEdit) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/system-annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COMMENT",
          x: pos.x,
          y: pos.y,
          pageNumber,
          color: "#F59E0B",
          content: "",
        }),
      });

      if (res.ok) {
        const annotation = await res.json();
        setSystemAnnotations((prev) => [...prev, annotation]);
        setSelectedAnnotationId(annotation.id);
        router.refresh();
      }
    } catch (err) {
      console.error("Error creating comment:", err);
    }
  }

  async function handleConfirmPolygon(systemCode: string) {
    if (!canEdit || currentPoints.length < 3) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/system-annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SYSTEM",
          systemCode,
          points: currentPoints,
          pageNumber,
          color: getNextColor(),
        }),
      });

      if (res.ok) {
        const annotation = await res.json();
        setSystemAnnotations((prev) => [...prev, annotation]);
        router.refresh();
      }
    } catch (err) {
      console.error("Error saving polygon:", err);
    } finally {
      setShowSystemPopup(false);
      setCurrentPoints([]);
      setActiveTool("cursor");
    }
  }

  function getNextColor(): string {
    const colors = [
      "#3B82F6",
      "#10B981",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
      "#EC4899",
      "#06B6D4",
      "#84CC16",
    ];

    const usedColors = systemAnnotations.map((a) => a.color);
    const availableColors = colors.filter((c) => !usedColors.includes(c));

    return availableColors.length > 0
      ? availableColors[0]
      : colors[systemAnnotations.length % colors.length];
  }

  async function handleDeleteSelection() {
    if (!canEdit || selectedAnnotationId === undefined) return;

    try {
      const res = await fetch(
        `/api/documents/${documentId}/system-annotations/${selectedAnnotationId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        setSystemAnnotations((prev) => prev.filter((a) => a.id !== selectedAnnotationId));
        setSelectedAnnotationId(undefined);
        router.refresh();
      }
    } catch (err) {
      console.error("Error deleting annotation:", err);
    }
  }

  function handleMarkerClick(marker: ComponentMarker) {
    if (!canEdit) return;

    // Toggle selection
    const newSelection = new Set(moveSelection);
    if (newSelection.has(marker.id)) {
      newSelection.delete(marker.id);
    } else {
      newSelection.add(marker.id);
    }
    setMoveSelection(newSelection);
  }

  // Track page size for annotation layer
  const updatePageSize = useCallback(() => {
    if (pageRef.current) {
      const rect = pageRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPageSize({ width: rect.width / scale, height: rect.height / scale });
      }
    }
  }, [scale]);

  useEffect(() => {
    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, [updatePageSize]);

  async function handleVerify(options: { enableGeometry?: boolean; save?: boolean } = {}) {
    setIsVerifying(true);
    setShowVerificationMatrix(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${documentId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options)
        }
      );
      if (res.ok) {
        const data = await res.json();
        setVerificationResult(data);
        // If we saved, we should also refresh the markers visualization
        if (options.save) {
          // We can trigger a re-fetch of components if useComponents has a mutate/refresh
          // For now, the user might need to reload or panning might trigger it if swr is used
        }
      }
    } catch (err) {
      console.error("Error verifying document:", err);
    } finally {
      setIsVerifying(false);
    }
  }

  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerateProtocol() {
    // Only ask for confirmation if not generating
    if (isGenerating) return;

    // Simple verification check - ensure we have system tags
    if (systemTags.length === 0) {
      toast.error("Dette dokumentet har ingen system-tags koblet til seg.");
      return;
    }

    if (!confirm(`Vil du opprette/oppdatere MC-protokoller for systemene: ${systemTags.join(", ")}?`)) {
      return;
    }

    setIsGenerating(true);
    const toastId = toast.loading("Genererer protokoller...");

    try {
      const res = await fetch(`/api/projects/${projectId}/mc-protocols`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemTags }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message, { id: toastId });
      } else {
        toast.error(data.error || "Feil ved generering", { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error("Kunne ikke kontakte serveren", { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PDFToolbar
        pageNumber={pageNumber}
        numPages={numPages}
        scale={scale}
        activeTool={activeTool}
        showPolygons={showPolygons}
        showMarkers={showMarkers}
        systemTags={systemTags}
        searchQuery={searchQuery}
        canEdit={canEdit}
        hasSelection={selectedAnnotationId !== undefined || moveSelection.size > 0}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToolChange={setActiveTool}
        onTogglePolygons={() => setShowPolygons(!showPolygons)}
        onToggleMarkers={() => setShowMarkers(!showMarkers)}
        onSearchChange={setSearchQuery}
        onDeleteSelection={handleDeleteSelection}
        onVerify={() => handleVerify({ enableGeometry: false })}
        onGenerateProtocol={handleGenerateProtocol}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted dark:bg-gray-900"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div className="relative inline-flex min-w-full justify-center p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted dark:bg-gray-900">
              <Loader2 className="animate-spin text-primary" size={48} />
            </div>
          )}

          <div className="relative inline-block">
            <Document file={url} onLoadSuccess={onDocumentLoadSuccess} loading={null}>
              <div
                ref={pageRef}
                className="relative"
                onClick={handlePageClick}
                onMouseDown={handleMouseDown}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  onLoadSuccess={updatePageSize}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </div>
            </Document>

            {/* Annotation Layer - Moved outside Document to prevent render blocking */}
            <div className="absolute inset-0 pointer-events-none">
              <AnnotationLayer
                key={`annotations-${pageNumber}-${searchQuery}-${searchHighlights.length}`}
                pageNumber={pageNumber}
                scale={scale}
                pageWidth={pageSize.width}
                pageHeight={pageSize.height}
                systemAnnotations={systemAnnotations}
                componentMarkers={componentMarkers}
                searchHighlights={searchHighlights}
                showPolygons={showPolygons}
                showMarkers={showMarkers}
                selectedAnnotationId={selectedAnnotationId}
                moveSelection={moveSelection}
                onAnnotationClick={setSelectedAnnotationId}
                onMarkerClick={handleMarkerClick}
                onMarkerHover={setHoveredMarker}
              />

              {/* Current Polygon Preview */}
              {currentPoints.length > 0 && (
                <svg
                  className="absolute top-0 left-0"
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={currentPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth={0.3}
                    strokeDasharray="2 1"
                  />
                  {currentPoints.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={0.5} fill="#3B82F6" />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hovered Marker Tooltip */}
      {hoveredMarker && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-md px-3 py-2 shadow-lg">
          <p className="text-sm font-mono">{hoveredMarker.code}</p>
          {hoveredMarker.system && (
            <p className="text-xs text-muted-foreground">System: {hoveredMarker.system}</p>
          )}
        </div>
      )}

      {/* System Selection Popup */}
      {showSystemPopup && (
        <SystemSelectionPopup
          availableSystems={systemTags}
          polygonPoints={currentPoints}
          onConfirm={handleConfirmPolygon}
          onCancel={() => {
            setShowSystemPopup(false);
            setCurrentPoints([]);
          }}
        />
      )}

      <VerificationMatrix
        isOpen={showVerificationMatrix}
        onClose={() => setShowVerificationMatrix(false)}
        result={verificationResult}
        isLoading={isVerifying}
      />
    </div>
  );
}
