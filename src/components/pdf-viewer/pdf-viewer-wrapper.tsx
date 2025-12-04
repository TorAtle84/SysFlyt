"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Annotation {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  systemTag?: string;
  createdBy: { firstName: string; lastName: string; email: string };
  comments: {
    id: string;
    content: string;
    author: { firstName: string; lastName: string };
    createdAt: string;
  }[];
}

interface ProjectMember {
  id: string;
  name: string;
  email: string;
}

interface PDFViewerWrapperProps {
  url: string;
  systemTags: string[];
  documentId: string;
  initialAnnotations: Annotation[];
  projectMembers: ProjectMember[];
  currentUserEmail?: string;
}

export default function PDFViewerWrapper({
  url,
  systemTags,
  documentId,
  initialAnnotations,
  projectMembers,
  currentUserEmail,
}: PDFViewerWrapperProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(
    null
  );
  const [newComment, setNewComment] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function goToPrevPage() {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  }

  function goToNextPage() {
    setPageNumber((prev) => Math.min(prev + 1, numPages || 1));
  }

  function zoomIn() {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }

  function zoomOut() {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }

  async function handleAddComment() {
    if (!selectedAnnotation || !newComment.trim()) return;

    setAddingComment(true);
    try {
      const res = await fetch(
        `/api/annotations/${selectedAnnotation.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newComment }),
        }
      );

      if (res.ok) {
        const comment = await res.json();
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === selectedAnnotation.id
              ? { ...a, comments: [...a.comments, comment] }
              : a
          )
        );
        setSelectedAnnotation((prev) =>
          prev ? { ...prev, comments: [...prev.comments, comment] } : null
        );
        setNewComment("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingComment(false);
    }
  }

  const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);

  return (
    <div className="flex h-full">
      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto bg-gray-900" ref={containerRef}>
        {/* Toolbar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={pageNumber <= 1}
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm text-foreground">
              Side {pageNumber} av {numPages || "..."}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={pageNumber >= (numPages || 1)}
            >
              <ChevronRight size={16} />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={zoomOut}>
              <ZoomOut size={16} />
            </Button>
            <span className="text-sm text-foreground">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn}>
              <ZoomIn size={16} />
            </Button>
          </div>

          <div className="flex gap-2">
            {systemTags.map((tag, idx) => (
              <Badge key={idx} tone="info">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* PDF Document */}
        <div className="relative flex justify-center p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <Loader2 className="animate-spin text-primary" size={48} />
            </div>
          )}
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
          >
            <div className="relative">
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderAnnotationLayer={false}
              />
              {/* Annotation overlays */}
              {pageAnnotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className={`absolute cursor-pointer border-2 transition-colors ${
                    selectedAnnotation?.id === annotation.id
                      ? "border-primary bg-primary/20"
                      : "border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
                  }`}
                  style={{
                    left: `${annotation.x * scale}px`,
                    top: `${annotation.y * scale}px`,
                    width: `${annotation.width * scale}px`,
                    height: `${annotation.height * scale}px`,
                  }}
                  onClick={() => setSelectedAnnotation(annotation)}
                >
                  {annotation.comments.length > 0 && (
                    <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                      {annotation.comments.length}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Document>
        </div>
      </div>

      {/* Annotation Panel */}
      {selectedAnnotation && (
        <div className="w-80 shrink-0 border-l border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Annotasjon</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedAnnotation(null)}
            >
              Lukk
            </Button>
          </div>

          <div className="mb-4 rounded-lg bg-muted/50 p-3">
            <p className="text-sm text-foreground">{selectedAnnotation.content}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Av {selectedAnnotation.createdBy.firstName}{" "}
              {selectedAnnotation.createdBy.lastName}
            </p>
          </div>

          <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageSquare size={14} />
            Kommentarer ({selectedAnnotation.comments.length})
          </h4>

          <div className="mb-4 max-h-60 space-y-3 overflow-auto">
            {selectedAnnotation.comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-border p-3"
              >
                <p className="text-sm text-foreground">{comment.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {comment.author.firstName} {comment.author.lastName}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="Skriv en kommentar..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[80px]"
            />
            <Button
              onClick={handleAddComment}
              disabled={!newComment.trim() || addingComment}
              loading={addingComment}
              className="w-full"
            >
              Legg til kommentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
