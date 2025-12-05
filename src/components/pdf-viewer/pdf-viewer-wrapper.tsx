"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useRouter } from "next/navigation";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Loader2,
  Plus,
  X,
  CheckCircle,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Annotation {
  id: string;
  x: number;
  y: number;
  status: string;
  author: { firstName: string; lastName: string; email: string };
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
  canEdit?: boolean;
}

export default function PDFViewerWrapper({
  url,
  systemTags,
  documentId,
  initialAnnotations,
  projectMembers,
  currentUserEmail,
  canEdit = true,
}: PDFViewerWrapperProps) {
  const router = useRouter();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [newComment, setNewComment] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [newPinPosition, setNewPinPosition] = useState<{ x: number; y: number } | null>(null);
  const [newPinComment, setNewPinComment] = useState("");
  const [creatingPin, setCreatingPin] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function goToPrevPage() {
    setPageNumber((prev) => Math.max(prev - 1, 1));
    setSelectedAnnotation(null);
    setNewPinPosition(null);
  }

  function goToNextPage() {
    setPageNumber((prev) => Math.min(prev + 1, numPages || 1));
    setSelectedAnnotation(null);
    setNewPinPosition(null);
  }

  function zoomIn() {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }

  function zoomOut() {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isAddingPin || !pageRef.current) return;

    const rect = pageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    setNewPinPosition({ x, y });
    setSelectedAnnotation(null);
  }

  async function handleCreatePin() {
    if (!newPinPosition) return;

    setCreatingPin(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: newPinPosition.x,
          y: newPinPosition.y,
          pageNumber,
          content: newPinComment,
        }),
      });

      if (res.ok) {
        const newAnnotation = await res.json();
        setAnnotations((prev) => [...prev, newAnnotation]);
        setNewPinPosition(null);
        setNewPinComment("");
        setIsAddingPin(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingPin(false);
    }
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

  async function handleToggleStatus(annotation: Annotation) {
    const newStatus = annotation.status === "OPEN" ? "CLOSED" : "OPEN";
    try {
      const res = await fetch(`/api/documents/${documentId}/annotations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotationId: annotation.id,
          status: newStatus,
        }),
      });

      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotation.id ? { ...a, status: newStatus } : a
          )
        );
        if (selectedAnnotation?.id === annotation.id) {
          setSelectedAnnotation((prev) =>
            prev ? { ...prev, status: newStatus } : null
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  const pageAnnotations = annotations;

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto bg-gray-900" ref={containerRef}>
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/90 px-4 py-2 backdrop-blur">
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

          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                variant={isAddingPin ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setIsAddingPin(!isAddingPin);
                  setNewPinPosition(null);
                  setSelectedAnnotation(null);
                }}
              >
                {isAddingPin ? (
                  <>
                    <X size={16} className="mr-1" />
                    Avbryt
                  </>
                ) : (
                  <>
                    <Plus size={16} className="mr-1" />
                    Ny pin
                  </>
                )}
              </Button>
            )}
            {systemTags.map((tag, idx) => (
              <Badge key={idx} tone="info">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {isAddingPin && (
          <div className="sticky top-[52px] z-10 border-b border-primary/50 bg-primary/10 px-4 py-2 text-center text-sm text-primary">
            Klikk på tegningen for å plassere en ny pin
          </div>
        )}

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
            <div
              ref={pageRef}
              className={`relative ${isAddingPin ? "cursor-crosshair" : ""}`}
              onClick={handlePageClick}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderAnnotationLayer={false}
              />
              {pageAnnotations.map((annotation) => (
                <button
                  key={annotation.id}
                  type="button"
                  className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-all ${
                    annotation.status === "CLOSED"
                      ? "bg-green-500 text-white"
                      : "animate-pulse bg-orange-500 text-white"
                  } ${
                    selectedAnnotation?.id === annotation.id
                      ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900"
                      : ""
                  }`}
                  style={{
                    left: `${annotation.x * scale}px`,
                    top: `${annotation.y * scale}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotation(annotation);
                    setNewPinPosition(null);
                  }}
                  title={annotation.status === "CLOSED" ? "Lukket" : "Åpen"}
                >
                  {annotation.status === "CLOSED" ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Circle size={14} />
                  )}
                </button>
              ))}
              {newPinPosition && (
                <div
                  className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white ring-offset-2 ring-offset-gray-900"
                  style={{
                    left: `${newPinPosition.x * scale}px`,
                    top: `${newPinPosition.y * scale}px`,
                  }}
                >
                  <Plus size={14} />
                </div>
              )}
            </div>
          </Document>
        </div>
      </div>

      {(selectedAnnotation || newPinPosition) && (
        <div className="w-80 shrink-0 border-l border-border bg-card p-4 overflow-y-auto">
          {newPinPosition ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Ny annotasjon</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewPinPosition(null);
                    setNewPinComment("");
                  }}
                >
                  <X size={16} />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                  Posisjon: ({Math.round(newPinPosition.x)}, {Math.round(newPinPosition.y)})
                </div>

                <Textarea
                  placeholder="Legg til en kommentar (valgfritt)..."
                  value={newPinComment}
                  onChange={(e) => setNewPinComment(e.target.value)}
                  className="min-h-[100px]"
                />

                <Button
                  onClick={handleCreatePin}
                  loading={creatingPin}
                  className="w-full"
                >
                  Opprett annotasjon
                </Button>
              </div>
            </>
          ) : selectedAnnotation ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Annotasjon</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAnnotation(null)}
                >
                  <X size={16} />
                </Button>
              </div>

              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Status: {selectedAnnotation.status === "CLOSED" ? "Lukket" : "Åpen"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Av {selectedAnnotation.author.firstName} {selectedAnnotation.author.lastName}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant={selectedAnnotation.status === "CLOSED" ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleToggleStatus(selectedAnnotation)}
                    >
                      {selectedAnnotation.status === "CLOSED" ? (
                        <>
                          <Circle size={14} className="mr-1" />
                          Gjenåpne
                        </>
                      ) : (
                        <>
                          <CheckCircle size={14} className="mr-1" />
                          Lukk
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <MessageSquare size={14} />
                Kommentarer ({selectedAnnotation.comments.length})
              </h4>

              <div className="mb-4 max-h-60 space-y-3 overflow-auto">
                {selectedAnnotation.comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen kommentarer enda</p>
                ) : (
                  selectedAnnotation.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <p className="text-sm text-foreground">{comment.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {comment.author.firstName} {comment.author.lastName}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {canEdit && (
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
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
