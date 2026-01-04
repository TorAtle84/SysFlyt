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
export async function runAnalysisPipeline(
    analysisId: string,
    files: { name: string; buffer: Buffer; mimeType?: string }[],
    userId: string,
    onProgress?: (progress: AnalysisProgress) => void
): Promise<void> {
    const tracker = new UsageTracker();

    const checkCostLimit = () => {
        if (tracker.totals.apiCostUsd > MAX_COST_USD) {
            throw new Error(`Kostnadsgrense overskredet: $${tracker.totals.apiCostUsd.toFixed(2)} > $${MAX_COST_USD}. Analysen ble stoppet for sikkerhet.`);
        }
    };

    const checkCancellation = async () => {
        const check = await prisma.kravsporingAnalysis.findUnique({
            where: { id: analysisId },
            select: { status: true }
        });
        if (check?.status === "CANCELLED") {
            throw new Error("CANCELLED");
        }
    };

    const report = (progress: AnalysisProgress) => {
        checkCostLimit();
        onProgress?.({ ...progress, costNok: tracker.totals.apiCostNok });
        console.log(`[Analysis ${analysisId}] ${progress.stage}: ${progress.message} (${tracker.totals.apiCostNok.toFixed(2)} NOK)`);
    };

    try {
        // Get analysis and project details
        const analysis = await prisma.kravsporingAnalysis.findUnique({
            where: { id: analysisId },
            include: {
                project: {
                    include: { disciplines: true },
                },
            },
        });

        if (!analysis) {
            throw new Error("Analyse ikke funnet");
        }

        // Get user's Gemini API key
        const apiKey = await getUserGeminiKey(userId);
        if (!apiKey) {
            throw new Error("Gemini API-nøkkel mangler. Konfigurer den i profilen din.");
        }

        // Prepare disciplines with keywords
        const disciplines: DisciplineWithKeywords[] = analysis.project.disciplines.map((d: { id: string; name: string }) => ({
            id: d.id,
            name: d.name,
            keywords: DEFAULT_DISCIPLINE_KEYWORDS[d.name] || [],
        }));

        // =========================================
        // Stage 0: Extract text from all files
        // =========================================
        report({ stage: "extracting", progress: 5, message: "Leser dokumenter..." });

        const extractedTexts: { fileName: string; content: string }[] = [];
        let emptyFilesCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const extracted = await extractText(file.buffer, file.name, file.mimeType);

            if (!extracted.content || extracted.content.trim().length === 0) {
                emptyFilesCount++;
                console.warn(`[Analysis ${analysisId}] No text found in file: ${file.name}`);
            }

            extractedTexts.push({ fileName: file.name, content: extracted.content });

            // Save file record
            await prisma.kravsporingFile.create({
                data: {
                    name: file.name,
                    path: `uploads/${analysisId}/${file.name}`,
                    size: file.buffer.length,
                    mimeType: file.mimeType,
                    analysisId,
                },
            });

            report({
                stage: "extracting",
                progress: 5 + (i / files.length) * 15,
                message: `Lest ${i + 1} av ${files.length} filer`,
            });

            await checkCancellation();
        }

        // =========================================
        // Stage 1: Unified Analysis (Find -> Validate -> Assign)
        // =========================================
        report({ stage: "finding", progress: 20, message: "Analyserer dokumenter med AI (Unified)..." });

        const requirementsToSave: {
            text: string;
            shortText: string | null;
            score: number;
            source: string | null;
            disciplineId: string | null;
        }[] = [];

        for (let i = 0; i < extractedTexts.length; i++) {
            const { fileName, content } = extractedTexts[i];
            // Use larger chunks for 2.5 Flash (approx 12k chars ~ 3000 tokens)
            // It has huge context, but we want to avoid timeout on generation
            const chunks = splitIntoChunks(content, 12000);

            // Process chunks in batches to balance speed vs. rate limits
            // Gemini Free Tier has strict RPM limits. Batch size of 3 is a safe middle ground.
            const BATCH_SIZE = 3;
            const chunksResults = [];

            for (let j = 0; j < chunks.length; j += BATCH_SIZE) {
                const batch = chunks.slice(j, j + BATCH_SIZE);
                const batchPromises = batch.map(chunk =>
                    analyzeRequirementsUnified(apiKey, chunk, fileName, disciplines, tracker)
                );

                // Wait for this batch to complete before starting the next
                const batchResults = await Promise.all(batchPromises);
                chunksResults.push(...batchResults);

                // Small delay between batches to be nice to the API
                if (j + BATCH_SIZE < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            for (const results of chunksResults) {
                for (const res of results) {
                    if (res.isRequirement && res.confidence > 0.4) {
                        const disc = disciplines.find(d => d.name === res.disciplineName);

                        requirementsToSave.push({
                            text: res.text,
                            shortText: res.shortText || null,
                            score: res.confidence,
                            source: fileName,
                            disciplineId: disc?.id || null,
                        });
                    }
                }
            }

            // Check cancellation after file is processed
            await checkCancellation();

            report({
                stage: "finding",
                progress: 20 + ((i + 1) / extractedTexts.length) * 70, // Map to range 20-90%
                message: `Analysert ${i + 1} av ${extractedTexts.length} dokumenter. Fant ${requirementsToSave.length} krav hittil.`,
                candidatesFound: requirementsToSave.length,
            });
        }

        // =========================================
        // Save all requirements to database
        // =========================================
        await prisma.kravsporingRequirement.createMany({
            data: requirementsToSave.map(req => ({
                ...req,
                analysisId,
                status: "ACTIVE" as const,
            })),
        });

        // Create update object with correct types from tracker
        const totals = tracker.totals;
        const updateData = {
            status: "COMPLETED",
            completedAt: new Date(),
            tokensUsed: totals.totalTokens,
            apiCostUsd: totals.apiCostUsd,
            apiCostNok: totals.apiCostNok,
            // Provider breakdown
            geminiTokens: totals.geminiTokens,
            geminiCostUsd: totals.geminiCostUsd,
            openaiTokens: totals.openaiTokens,
            openaiCostUsd: totals.openaiCostUsd,
            // Active keys snapshot
            activeKeys: totals.activeKeys,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.kravsporingAnalysis.update({
            where: { id: analysisId },
            data: updateData as any,
        });

        let completionMessage = `Analyse fullført! ${requirementsToSave.length} krav lagret. Kostnad: ${totals.apiCostNok.toFixed(2)} NOK`;

        if (emptyFilesCount > 0) {
            completionMessage += `. ADVARSEL: Fant ingen tekst i ${emptyFilesCount} av ${files.length} filer.`;
        }

        report({
            stage: "completed",
            progress: 100,
            message: completionMessage,
            requirementsValidated: requirementsToSave.length,
        });

    } catch (error) {
        console.error("Analysis pipeline error:", error);

        // Get costs even on failure
        const totals = tracker.totals;

        // Mark analysis as failed with costs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.kravsporingAnalysis.update({
            where: { id: analysisId },
            data: {
                status: "FAILED",
                errorMessage: error instanceof Error ? error.message : "Ukjent feil",
                tokensUsed: totals.totalTokens,
                apiCostUsd: totals.apiCostUsd,
                apiCostNok: totals.apiCostNok,
                // Provider breakdown
                geminiTokens: totals.geminiTokens,
                geminiCostUsd: totals.geminiCostUsd,
                openaiTokens: totals.openaiTokens,
                openaiCostUsd: totals.openaiCostUsd,
                // Active keys snapshot
                activeKeys: totals.activeKeys,
            } as any,
        });

        // If it was cancelled, we don't report failure to the UI in the same way, or the UI handles "failed" with message "Analyse avbrutt"
        report({
            stage: "failed",
            progress: 0,
            message: error instanceof Error && error.message === "CANCELLED" ? "Analyse avbrutt av bruker" : (error instanceof Error ? error.message : "Analyse feilet"),
        });

        throw error;
    }
}
