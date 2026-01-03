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
} from "./gemini-analysis";
import prisma from "@/lib/db";

export interface AnalysisProgress {
    stage: "extracting" | "finding" | "validating" | "assigning" | "completed" | "failed";
    progress: number;
    message: string;
    candidatesFound?: number;
    requirementsValidated?: number;
}

interface DisciplineWithKeywords {
    id: string;
    name: string;
    keywords: string[];
}

/**
 * Run the full 3-stage analysis pipeline
 */
export async function runAnalysisPipeline(
    analysisId: string,
    files: { name: string; buffer: Buffer; mimeType?: string }[],
    userId: string,
    onProgress?: (progress: AnalysisProgress) => void
): Promise<void> {
    const report = (progress: AnalysisProgress) => {
        onProgress?.(progress);
        console.log(`[Analysis ${analysisId}] ${progress.stage}: ${progress.message}`);
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
        const disciplines: DisciplineWithKeywords[] = analysis.project.disciplines.map(d => ({
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
                const candidates = await findRequirementCandidates(apiKey, chunk, fileName);
                allCandidates.push(...candidates);
            }

            report({
                stage: "finding",
                progress: 20 + (i / extractedTexts.length) * 25,
                message: `Analysert ${i + 1} av ${extractedTexts.length} dokumenter`,
                candidatesFound: allCandidates.length,
            });
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
            const validated = await validateRequirements(apiKey, batch);

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
                message: `Validert ${Math.min(i + batchSize, allCandidates.length)} av ${allCandidates.length}`,
                requirementsValidated: validatedRequirements.length,
            });
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
                assignment = await assignDisciplineWithAI(apiKey, req.text, disciplines);
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

        // Mark analysis as completed
        await prisma.kravsporingAnalysis.update({
            where: { id: analysisId },
            data: {
                status: "COMPLETED",
                completedAt: new Date(),
            },
        });

        report({
            stage: "completed",
            progress: 100,
            message: `Analyse fullført! ${requirementsToSave.length} krav lagret.`,
            requirementsValidated: requirementsToSave.length,
        });

    } catch (error) {
        console.error("Analysis pipeline error:", error);

        // Mark analysis as failed
        await prisma.kravsporingAnalysis.update({
            where: { id: analysisId },
            data: {
                status: "FAILED",
                errorMessage: error instanceof Error ? error.message : "Ukjent feil",
            },
        });

        report({
            stage: "failed",
            progress: 0,
            message: error instanceof Error ? error.message : "Analyse feilet",
        });

        throw error;
    }
}
