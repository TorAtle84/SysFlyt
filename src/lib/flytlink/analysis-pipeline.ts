import { extractText, splitIntoChunks } from "./text-extraction";
import {
    findRequirementCandidates,
    validateRequirements,
    matchDisciplineByKeywords,
    assignDisciplineWithAI,
    getUserGeminiKey,
    RequirementCandidate,
    ValidatedRequirement,
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

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const extracted = await extractText(file.buffer, file.name, file.mimeType);
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
        // Stage 1: Find requirement candidates
        // =========================================
        report({ stage: "finding", progress: 20, message: "Søker etter krav-kandidater..." });

        const allCandidates: RequirementCandidate[] = [];

        for (let i = 0; i < extractedTexts.length; i++) {
            const { fileName, content } = extractedTexts[i];
            const chunks = splitIntoChunks(content, 4000);

            for (const chunk of chunks) {
                const candidates = await findRequirementCandidates(apiKey, chunk, fileName, tracker);
                allCandidates.push(...candidates);
            }

            report({
                stage: "finding",
                progress: 10 + (i / extractedTexts.length) * 35,
                message: `Analysert ${i + 1} av ${extractedTexts.length} dokumenter`,
                candidatesFound: allCandidates.length,
            });

            await checkCancellation();
        }

        report({
            stage: "finding",
            progress: 45,
            message: `Fant ${allCandidates.length} kandidater`,
            candidatesFound: allCandidates.length,
        });

        // =========================================
        // Stage 2: Validate requirements
        // =========================================
        report({ stage: "validating", progress: 50, message: "Validerer krav..." });

        // Process in batches to avoid token limits
        const batchSize = 10;
        const validatedRequirements: (ValidatedRequirement & { source?: string })[] = [];

        for (let i = 0; i < allCandidates.length; i += batchSize) {
            const batch = allCandidates.slice(i, i + batchSize);
            const validated = await validateRequirements(apiKey, batch, tracker);

            // Match validated results with original candidates to preserve source
            for (let j = 0; j < validated.length; j++) {
                if (validated[j].isRequirement) {
                    validatedRequirements.push({
                        ...validated[j],
                        source: batch[j]?.source,
                    });
                }
            }

            report({
                stage: "validating",
                progress: 50 + (i / allCandidates.length) * 20,
                message: `Validert ${i + validated.length} av ${allCandidates.length} kandidater`,
                requirementsValidated: validatedRequirements.length,
            });

            await checkCancellation();
        }

        report({
            stage: "validating",
            progress: 70,
            message: `${validatedRequirements.length} gyldige krav identifisert`,
            requirementsValidated: validatedRequirements.length,
        });

        // =========================================
        // Stage 3: Assign disciplines
        // =========================================
        report({ stage: "assigning", progress: 75, message: "Tildeler fag..." });

        const requirementsToSave: {
            text: string;
            shortText: string | null;
            score: number;
            source: string | null;
            disciplineId: string | null;
        }[] = [];

        for (let i = 0; i < validatedRequirements.length; i++) {
            const req = validatedRequirements[i];

            // First try keyword matching
            let assignment = matchDisciplineByKeywords(req.text, disciplines);

            // If low confidence, use AI
            if (assignment.confidence < 0.6) {
                assignment = await assignDisciplineWithAI(apiKey, req.text, disciplines, tracker);
            }

            requirementsToSave.push({
                text: req.text,
                shortText: req.shortText || null,
                score: req.confidence,
                source: req.source || null,
                disciplineId: assignment.disciplineId,
            });

            if (i % 5 === 0) {
                report({
                    stage: "assigning",
                    progress: 75 + (i / validatedRequirements.length) * 20,
                    message: `Tildelt fag til ${i + 1} av ${validatedRequirements.length} krav`,
                });
            }
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

        report({
            stage: "completed",
            progress: 100,
            message: `Analyse fullført! ${requirementsToSave.length} krav lagret. Kostnad: ${totals.apiCostNok.toFixed(2)} NOK`,
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
