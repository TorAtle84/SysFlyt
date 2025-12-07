"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  MousePointer,
  Hand,
  Pentagon,
  MessageSquare,
  Eye,
  EyeOff,
  Trash2,
  Search,
} from "lucide-react";

export type Tool = "cursor" | "hand" | "polygon" | "comment";

interface PDFToolbarProps {
  pageNumber: number;
  numPages: number | null;
  scale: number;
  activeTool: Tool;
  showPolygons: boolean;
  showMarkers: boolean;
  systemTags: string[];
  searchQuery: string;
  canEdit: boolean;
  hasSelection: boolean;

  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToolChange: (tool: Tool) => void;
  onTogglePolygons: () => void;
  onToggleMarkers: () => void;
  onSearchChange: (query: string) => void;
  onDeleteSelection: () => void;
}

/**
 * PDF Toolbar with navigation, zoom, tools, and search
 */
export default function PDFToolbar({
  pageNumber,
  numPages,
  scale,
  activeTool,
  showPolygons,
  showMarkers,
  systemTags,
  searchQuery,
  canEdit,
  hasSelection,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onToolChange,
  onTogglePolygons,
  onToggleMarkers,
  onSearchChange,
  onDeleteSelection,
}: PDFToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/90 px-4 py-2 backdrop-blur">
      {/* LEFT: Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevPage}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm text-foreground min-w-[100px] text-center">
          Side {pageNumber} av {numPages || "..."}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNextPage}
          disabled={pageNumber >= (numPages || 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* CENTER: Tools */}
      <div className="flex items-center gap-2">
        {/* Zoom */}
        <Button variant="outline" size="sm" onClick={onZoomOut} disabled={scale <= 0.5}>
          <ZoomOut size={16} />
        </Button>
        <span className="text-sm text-foreground min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="outline" size="sm" onClick={onZoomIn} disabled={scale >= 5}>
          <ZoomIn size={16} />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Tool Selection */}
        {canEdit && (
          <>
            <Button
              variant={activeTool === "cursor" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("cursor")}
              title="Markør"
            >
              <MousePointer size={16} />
            </Button>
            <Button
              variant={activeTool === "hand" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("hand")}
              title="Pan (dra)"
            >
              <Hand size={16} />
            </Button>
            <Button
              variant={activeTool === "polygon" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("polygon")}
              title="Tegn systemgrense"
            >
              <Pentagon size={16} />
            </Button>
            <Button
              variant={activeTool === "comment" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("comment")}
              title="Kommentar"
            >
              <MessageSquare size={16} />
            </Button>
          </>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Toggle Visibility */}
        <Button
          variant={showPolygons ? "default" : "outline"}
          size="sm"
          onClick={onTogglePolygons}
          title={showPolygons ? "Skjul polygoner" : "Vis polygoner"}
        >
          {showPolygons ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="ml-1 text-xs">Polygoner</span>
        </Button>
        <Button
          variant={showMarkers ? "default" : "outline"}
          size="sm"
          onClick={onToggleMarkers}
          title={showMarkers ? "Skjul markører" : "Vis markører"}
        >
          {showMarkers ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="ml-1 text-xs">Markører</span>
        </Button>

        {/* Delete Selection */}
        {canEdit && hasSelection && (
          <>
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              variant="destructive"
              size="sm"
              onClick={onDeleteSelection}
              title="Slett valgte"
            >
              <Trash2 size={16} />
            </Button>
          </>
        )}
      </div>

      {/* RIGHT: Search & System Tags */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            type="text"
            placeholder="Søk i dokument..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 w-48 h-8"
          />
        </div>

        {/* System Tags */}
        {systemTags.map((tag, idx) => (
          <Badge key={idx} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}
