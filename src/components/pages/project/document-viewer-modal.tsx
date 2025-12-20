"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import PDFViewerWrapper from "@/components/pdf-viewer/pdf-viewer-wrapper";
import FunctionDescriptionViewerWrapper from "@/components/function-description/function-description-viewer-wrapper";
import { Loader2 } from "lucide-react";
import SaveAndCloseButton from "@/components/pdf-viewer/save-and-close-button";

interface DocumentViewerModalProps {
    documentId: string | null;
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    initialComponent?: string;
    initialPage?: number;
}

interface DocumentData {
    id: string;
    url: string;
    title: string;
    systemTags: string[];
    systemAnnotations: any[];
}

export function DocumentViewerModal({
    documentId,
    projectId,
    isOpen,
    onClose,
    initialComponent,
    initialPage,
}: DocumentViewerModalProps) {
    const [document, setDocument] = useState<DocumentData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchDocument() {
            if (!documentId || !isOpen) return;

            setIsLoading(true);
            setError(null);
            setDocument(null);

            try {
                const res = await fetch(`/api/projects/${projectId}/documents/${documentId}`);
                if (!res.ok) throw new Error("Kunne ikke laste dokumentet");

                const data = await res.json();

                // Format annotations to match PDFViewerWrapper expectations
                // The API returns nested structure, flatten or format as needed
                const formattedAnnotations = data.systemAnnotations?.map((a: any) => ({
                    id: a.id,
                    type: a.type,
                    systemCode: a.systemCode || undefined,
                    content: a.content || undefined,
                    mentions: a.mentions || undefined,
                    points: a.points || undefined,
                    x: a.x || undefined,
                    y: a.y || undefined,
                    width: a.width || undefined,
                    height: a.height || undefined,
                    color: a.color,
                    pageNumber: a.pageNumber,
                })) || [];

                setDocument({
                    ...data,
                    systemAnnotations: formattedAnnotations,
                });
            } catch (err) {
                console.error(err);
                setError("Feil ved lasting av dokument");
            } finally {
                setIsLoading(false);
            }
        }

        fetchDocument();
    }, [documentId, projectId, isOpen]);

    // Clean format helper
    const canEdit = true; // Assuming check happens in viewer or access control via header

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] !max-w-[95vw] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-lg">
                <VisuallyHidden>
                    <DialogTitle>Document Viewer</DialogTitle>
                </VisuallyHidden>
                {isLoading && (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="animate-spin text-primary" size={48} />
                    </div>
                )}

                {error && (
                    <div className="flex h-full items-center justify-center text-destructive">
                        {error}
                    </div>
                )}

                {!isLoading && document && (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Remove header as it is part of the viewers now, or customize logic. 
                            Actually FunctionDescriptionViewer has its own header structure. 
                            Let's keep generic container but conditionally render the viewer content.
                        */}

                        <div className="flex-1 relative overflow-hidden bg-muted dark:bg-gray-900 border-none">
                            {/* Assuming document has a 'type' field from the fetch - we need to update interface */}
                            {(document as any).type === "FUNCTION_DESCRIPTION" ? (
                                <FunctionDescriptionViewerWrapper
                                    url={document.url}
                                    systemTags={document.systemTags}
                                    documentId={document.id}
                                    projectId={projectId}
                                    initialSystemAnnotations={document.systemAnnotations}
                                    canEdit={canEdit}
                                    initialPage={initialPage}
                                />
                            ) : (
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center p-4 border-b bg-card shrink-0">
                                        <h1 className="text-xl font-bold truncate pr-4">{document.title}</h1>
                                        <SaveAndCloseButton
                                            projectId={projectId}
                                            documentId={document.id}
                                            systemTags={document.systemTags}
                                        />
                                    </div>
                                    <div className="flex-1 relative overflow-hidden">
                                        <PDFViewerWrapper
                                            url={document.url}
                                            systemTags={document.systemTags}
                                            documentId={document.id}
                                            projectId={projectId}
                                            initialSystemAnnotations={document.systemAnnotations}
                                            canEdit={canEdit}
                                            initialComponent={initialComponent}
                                            initialPage={initialPage}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
