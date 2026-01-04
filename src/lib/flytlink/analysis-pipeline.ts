import { extractText, splitIntoChunks } from "./text-extraction";
import {
    analyzeRequirementsUnified,
    getUserGeminiKey,
    UnifiedRequirementResult,
    DEFAULT_DISCIPLINE_KEYWORDS,
    UsageTracker,
} from "./gemini-analysis";
import prisma from "@/lib/db";

export interface AnalysisProgress {
    stage: "extracting" | "finding" | "validating" | "assigning" | "completed" | "failed";
    progress: number;
    message: string;
    candidatesFound?: number;
    requirementsValidated?: number;
    costNok?: number;
}

interface DisciplineWithKeywords {
    id: string;
    name: string;
    keywords: string[];
}

// Maximum cost allowed per analysis (in USD) - safety limit
const MAX_COST_USD = 2.0;

/**
 * Run the full 3-stage analysis pipeline
 */
/**
 * PREPARE ANALYSIS (Stage 1)
 * Extracts text from files and creates chunks.
 * Returns chunks to the client for processing to avoid timeouts.
 */
export async function prepareAnalysis(
    files: { name: string; buffer: Buffer; mimeType?: string }[],
    userId: string,
    projectId: string
): Promise<{
    analysisId: string;
    chunks: { text: string; fileName: string; index: number; total: number }[];
}> {
    // 1. Create Analysis Record (PROCESSING)
    const analysis = await prisma.kravsporingAnalysis.create({
        data: {
            projectId,
            status: "PROCESSING",
        },
    });

    const analysisId = analysis.id;
    const allChunks: { text: string; fileName: string; index: number; total: number }[] = [];

    // 2. Extract Text & Chunk (Fast, usually < 10s for moderate files)
    let chunkGlobalIndex = 0;

    for (const file of files) {
        const extracted = await extractText(file.buffer, file.name, file.mimeType);

        // Save file record
        await prisma.kravsporingFile.create({
            data: {
                name: file.name,
                path: `uploads/${analysisId}/${file.name}`,
                size: file.buffer.length,
                mimeType: file.mimeType,
                analysisId,
            } as any,
        });

        if (extracted.content && extracted.content.trim().length > 0) {
            // Use larger chunks for Gemini 2.5 Flash
            const fileChunks = splitIntoChunks(extracted.content, 12000);
            fileChunks.forEach(text => {
                allChunks.push({
                    text,
                    fileName: file.name,
                    index: chunkGlobalIndex++,
                    total: 0 // Will set later
                });
            });
        }
    }

    // Update total count in chunks
    allChunks.forEach(c => c.total = allChunks.length);

    return { analysisId, chunks: allChunks };
}

/**
 * PROCESS SINGLE CHUNK (Stage 2)
 * Called by client for each chunk.
 * Stateless, idempotent-ish (safe to retry if needed).
 */
export async function processChunk(
    analysisId: string,
    chunk: { text: string; fileName: string },
    userId: string
): Promise<{ requirementsFound: number }> {
    const tracker = new UsageTracker();

    try {
        // 1. Get Project Context
        const analysis = await prisma.kravsporingAnalysis.findUnique({
            where: { id: analysisId },
            include: { project: { include: { disciplines: true } } },
        });

        if (!analysis) throw new Error("Analysis not found");
        if (analysis.status === "CANCELLED") throw new Error("CANCELLED");

        // 2. Get API Key
        const apiKey = await getUserGeminiKey(userId);
        if (!apiKey) throw new Error("Missing Gemini API Key");

        // 3. Prepare Disciplines
        const disciplines: DisciplineWithKeywords[] = analysis.project.disciplines.map((d: any) => ({
            id: d.id,
            name: d.name,
            keywords: DEFAULT_DISCIPLINE_KEYWORDS[d.name] || []
        }));

        // 4. Analyze Chunk (AI Call)
        const results = await analyzeRequirementsUnified(apiKey, chunk.text, chunk.fileName, disciplines, tracker);

        // 5. Filter Requirements
        const requirementsToSave = results
            .filter(res => res.isRequirement && res.confidence > 0.4)
            .map(res => {
                const disc = disciplines.find(d => d.name === res.disciplineName);
                return {
                    analysisId,
                    text: res.text,
                    shortText: res.shortText || null,
                    score: res.confidence,
                    source: chunk.fileName,
                    disciplineId: disc?.id || null,
                    status: "ACTIVE" as const,
                };
            });

        // 6. Save Requirements
        if (requirementsToSave.length > 0) {
            await prisma.kravsporingRequirement.createMany({
                data: requirementsToSave as any,
            });
        }

        // 7. Update Usage & Cost (Atomic Increment)
        // We use 'increment' to safely handle concurrent chunk processing.
        const t = tracker.totals;
        await prisma.kravsporingAnalysis.update({
            where: { id: analysisId },
            data: {
                tokensUsed: { increment: t.totalTokens },
                apiCostUsd: { increment: t.apiCostUsd },
                apiCostNok: { increment: t.apiCostNok },
                geminiTokens: { increment: t.geminiTokens },
                geminiCostUsd: { increment: t.geminiCostUsd },
                openaiTokens: { increment: t.openaiTokens },
                openaiCostUsd: { increment: t.openaiCostUsd },
                // Simply update activeKeys to latest snaphot (not perfect but acceptable)
                activeKeys: t.activeKeys,
            } as any,
        });

        return { requirementsFound: requirementsToSave.length };

    } catch (error) {
        console.error("Error processing chunk:", error);
        throw error;
    }
}

/**
 * FINALIZE ANALYSIS (Stage 3)
 * Called by client after all chunks are done.
 */
export async function finalizeAnalysis(analysisId: string) {
    await prisma.kravsporingAnalysis.update({
        where: { id: analysisId },
        data: {
            status: "COMPLETED",
            completedAt: new Date(),
        },
    });
}


