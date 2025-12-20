"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Dynamic import to avoid SSR issues with PDF.js
const FunctionDescriptionViewer = dynamic(() => import("./function-description-viewer"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-muted dark:bg-gray-900">
            <Loader2 className="animate-spin text-primary" size={48} />
        </div>
    ),
});

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

interface FunctionDescriptionViewerWrapperProps {
    url: string;
    systemTags: string[];
    documentId: string;
    projectId: string;
    initialSystemAnnotations: SystemAnnotation[];
    canEdit?: boolean;
    initialPage?: number;
}

/**
 * Wrapper for FunctionDescriptionViewer with dynamic import to prevent SSR issues
 */
export default function FunctionDescriptionViewerWrapper(props: FunctionDescriptionViewerWrapperProps) {
    return <FunctionDescriptionViewer {...props} />;
}
