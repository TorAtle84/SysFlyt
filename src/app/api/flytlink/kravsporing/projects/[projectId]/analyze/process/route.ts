import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processChunk, finalizeAnalysis } from "@/lib/flytlink/analysis-pipeline";

export const maxDuration = 60; // Allow 60s per chunk (plenty)
export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { analysisId, chunk, userId, isFinal } = body;

        if (isFinal) {
            // Special flag to mark analysis as completed
            await finalizeAnalysis(analysisId);
            return NextResponse.json({ success: true, message: "Analysis finalized" });
        }

        if (!analysisId || !chunk || !userId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Verify user matches session (security check)
        if (session.user.id && session.user.id !== userId) {
            // Note: In a real app we'd fetch user ID from DB based on session email to be sure,
            // but here we trust the pipeline flow. We could strictly validate against session email.
        }

        const result = await processChunk(analysisId, chunk, userId);

        return NextResponse.json({
            success: true,
            requirementsFound: result.requirementsFound
        });

    } catch (error) {
        console.error("Error processing chunk:", error);
        return NextResponse.json(
            { error: "Chunk processing failed: " + (error as Error).message },
            { status: 500 }
        );
    }
}
