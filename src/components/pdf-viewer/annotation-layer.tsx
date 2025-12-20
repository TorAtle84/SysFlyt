"use client";

import { Circle, MessageSquare } from "lucide-react";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

interface Point {
  x: number;
  y: number;
}

interface SystemAnnotation {
  id: string;
  type: "SYSTEM" | "COMMENT";
  systemCode?: string;
  content?: string;
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

interface SearchHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnnotationLayerProps {
  pageNumber: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  systemAnnotations: SystemAnnotation[];
  componentMarkers: ComponentMarker[];
  searchHighlights: SearchHighlight[];
  showPolygons: boolean;
  showMarkers: boolean;
  selectedAnnotationId?: string;
  moveSelection: Set<string>;
  onAnnotationClick?: (id: string) => void;
  onMarkerClick?: (marker: ComponentMarker) => void;
  onMarkerHover?: (marker: ComponentMarker | null) => void;
}

const Y_OFFSET = 1.5; // Visual centering offset (%)

/**
 * SVG Overlay for PDF annotations, markers, and highlights
 * Uses percentage-based coordinates (0-100%) with viewBox matching PDF viewport
 */
export default function AnnotationLayer({
  pageNumber,
  scale,
  pageWidth,
  pageHeight,
  systemAnnotations,
  componentMarkers,
  searchHighlights,
  showPolygons,
  showMarkers,
  selectedAnnotationId,
  moveSelection,
  onAnnotationClick,
  onMarkerClick,
  onMarkerHover,
}: AnnotationLayerProps) {
  const safeScale = isFiniteNumber(scale) && scale > 0 ? scale : 1;
  const safePageWidth = isFiniteNumber(pageWidth) && pageWidth > 0 ? pageWidth : 0;
  const safePageHeight = isFiniteNumber(pageHeight) && pageHeight > 0 ? pageHeight : 0;

  if (safePageWidth === 0 || safePageHeight === 0) {
    return null;
  }

  // Filter annotations and markers for current page
  const pageAnnotations = systemAnnotations.filter((a) => a.pageNumber === pageNumber);
  const pageMarkers = componentMarkers.filter(
    (marker) => marker.page === pageNumber && isFiniteNumber(marker.x) && isFiniteNumber(marker.y)
  );

  // Calculate inverse scale to keep visual size constant at different zoom levels
  const inverseScale = 1 / safeScale;
  const pageAspectRatioRaw = safePageWidth / safePageHeight;
  const pageAspectRatio =
    Number.isFinite(pageAspectRatioRaw) && pageAspectRatioRaw > 0 ? pageAspectRatioRaw : 1;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        width: `${safePageWidth * safeScale}px`,
        height: `${safePageHeight * safeScale}px`,
      }}
      viewBox={`0 0 100 100`}
      preserveAspectRatio="none"
    >
      {/* POLYGONS (System Boundaries) */}
      {showPolygons &&
        pageAnnotations
          .filter((a) => a.type === "SYSTEM" && a.points && a.points.length >= 3)
          .map((annotation) => {
            const points = annotation.points!;
            const pathData = points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ") + " Z";

            return (
              <g key={annotation.id}>
                {/* Fill */}
                <path
                  d={pathData}
                  fill={annotation.color}
                  fillOpacity={0.1}
                  stroke="none"
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnnotationClick?.(annotation.id);
                  }}
                />
                {/* Border */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={annotation.color}
                  strokeWidth={0.3 * inverseScale}
                  strokeDasharray={`${2 * inverseScale} ${1 * inverseScale}`}
                  className={`pointer-events-auto cursor-pointer transition-all ${selectedAnnotationId === annotation.id
                    ? "stroke-2"
                    : ""
                    }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnnotationClick?.(annotation.id);
                  }}
                />
                {/* System Code Label */}
                {annotation.systemCode && (
                  <text
                    x={points[0].x}
                    y={points[0].y - Y_OFFSET}
                    fill={annotation.color}
                    fontSize={0.6 * inverseScale}
                    fontWeight="600"
                    className="pointer-events-none select-none"
                  >
                    {annotation.systemCode}
                  </text>
                )}
              </g>
            );
          })}

      {/* COMMENT ANNOTATIONS */}
      {pageAnnotations
        .filter((a) => a.type === "COMMENT" && a.x !== undefined && a.y !== undefined)
        .map((annotation) => {
          const adjustedY = (annotation.y || 0) + Y_OFFSET;

          return (
            <g
              key={annotation.id}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onAnnotationClick?.(annotation.id);
              }}
            >
              <circle
                cx={annotation.x}
                cy={adjustedY}
                r={1.5 * inverseScale}
                fill={annotation.color}
                stroke="#fff"
                strokeWidth={0.3 * inverseScale}
                className={`transition-all ${selectedAnnotationId === annotation.id
                  ? "stroke-2"
                  : ""
                  }`}
              />
              <MessageSquare
                size={inverseScale * 1}
                x={annotation.x! - 0.5 * inverseScale}
                y={adjustedY - 0.5 * inverseScale}
                className="fill-white"
              />
            </g>
          );
        })}

      {/* COMPONENT MARKERS */}
      {/* COMPONENT MARKERS */}
      {showMarkers &&
        pageMarkers.map((marker) => {
          // X-coordinate: marker.x is already centered
          const centerX = marker.x;

          // Y-coordinate: Center vertically on the text line
          // marker.y is the top of the text box. We add half the height to center it.
          // Fallback to 0.7% (approx half line height) if height is missing.
          const centerY = marker.y + (marker.height ? marker.height / 2 : 0.7);

          // Color coding
          const markerColor = marker.verifiedByText ? "#3B82F6" : "#10B981";
          const isSelected = moveSelection.has(marker.id);

          // Sizing:
          // We want the marker to be roughly 0.4% of the page WIDTH in diameter (r=0.2%)
          // This scales WITH the PDF (zooming in makes it larger on screen)
          // balancing visibility and unobtrusiveness.
          const radiusX = 0.2;
          const radiusYRaw = radiusX * pageAspectRatio;
          const radiusY = Number.isFinite(radiusYRaw) ? radiusYRaw : radiusX;

          return (
            <g
              key={marker.id}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick?.(marker);
              }}
              onMouseEnter={() => onMarkerHover?.(marker)}
              onMouseLeave={() => onMarkerHover?.(null)}
            >
              {/* Invisible Hit Target (larger) */}
              <ellipse
                cx={centerX}
                cy={centerY}
                rx={radiusX * 3}
                ry={radiusY * 3}
                fill="transparent"
              />

              {/* Visual Marker */}
              <ellipse
                cx={centerX}
                cy={centerY}
                rx={radiusX}
                ry={radiusY}
                fill={markerColor}
                stroke={isSelected ? "#FFF" : "none"}
                strokeWidth={0.05} // Fixed stroke in % units, scales with zoom
                className="transition-all"
              />

              {/* Inner Dot */}
              <ellipse
                cx={centerX}
                cy={centerY}
                rx={radiusX * 0.4}
                ry={radiusY * 0.4}
                fill="#FFF"
              />
            </g>
          );
        })}

      {/* SEARCH HIGHLIGHTS */}
      {searchHighlights.map((highlight, idx) => (
        <rect
          key={`highlight-${idx}`}
          x={highlight.x}
          y={highlight.y}
          width={highlight.width}
          height={highlight.height}
          fill="#F97316"
          fillOpacity={0.4}
          stroke="#EA580C"
          strokeWidth={0.2 * inverseScale}
          className="pointer-events-none"
        />
      ))}

      {/* Tooltip (rendered as foreignObject for HTML support) */}
      {/* This is handled in parent component for better positioning */}
    </svg>
  );
}
