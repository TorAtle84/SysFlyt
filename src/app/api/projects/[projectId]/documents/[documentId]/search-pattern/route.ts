import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { scanDocumentForCustomPattern } from "@/lib/scan";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const { projectId, documentId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const { pattern } = await request.json();
        console.log(`[API] Search request for doc ${documentId} with pattern: "${pattern}"`);

        if (!pattern || typeof pattern !== "string") {
            return NextResponse.json(
                { error: "Pattern string is required" },
                { status: 400 }
            );
        }

        try {
            const result = await scanDocumentForCustomPattern(documentId, pattern);
            console.log(`[API] Search found ${result.matches.length} matches for pattern: "${pattern}"`);
            return NextResponse.json(result);
        } catch (err: unknown) {
            console.error(`[API] Error during custom search:`, err);
            if (err instanceof Error && err.message === "Document not found") {
                return NextResponse.json({ error: "Document not found" }, { status: 404 });
            }
            throw err;
        }
    } catch (error) {
        console.error("Error searching document:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
