/**
 * TFM Comparison API
 * POST: Run comparison on uploaded files
 */

import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-helpers";
import {
    TfmSegmentConfig,
    extractTfmFromFile,
    compareTfmEntries,
    TfmExtractionResult,
} from "@/lib/tfm-extractor";

export const config = {
    api: {
        bodyParser: false,
    },
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const formData = await request.formData();
        const mainFile = formData.get("mainFile") as File | null;
        const comparisonFilesRaw = formData.getAll("comparisonFiles") as File[];
        const segmentConfigRaw = formData.get("segmentConfig") as string;

        if (!mainFile) {
            return NextResponse.json(
                { error: "Hovedfil er påkrevd" },
                { status: 400 }
            );
        }

        if (comparisonFilesRaw.length === 0) {
            return NextResponse.json(
                { error: "Minst én sammenligningsfil er påkrevd" },
                { status: 400 }
            );
        }

        let segmentConfig: TfmSegmentConfig;
        try {
            segmentConfig = JSON.parse(segmentConfigRaw);
        } catch {
            return NextResponse.json(
                { error: "Ugyldig segmentkonfigurasjon" },
                { status: 400 }
            );
        }

        // Check at least one segment is selected
        if (!segmentConfig.byggnr && !segmentConfig.system &&
            !segmentConfig.komponent && !segmentConfig.typekode) {
            return NextResponse.json(
                { error: "Velg minst ett segment" },
                { status: 400 }
            );
        }

        // Extract TFM from main file
        const mainFileBuffer = Buffer.from(await mainFile.arrayBuffer());
        const mainResult = await extractTfmFromFile(
            mainFileBuffer,
            mainFile.name,
            segmentConfig
        );

        if (mainResult.error) {
            return NextResponse.json(
                { error: `Feil ved lesing av hovedfil: ${mainResult.error}` },
                { status: 400 }
            );
        }

        // Extract TFM from comparison files
        const comparisonResults: TfmExtractionResult[] = [];
        for (const file of comparisonFilesRaw) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const result = await extractTfmFromFile(buffer, file.name, segmentConfig);
            comparisonResults.push(result);
        }

        // Run comparison
        const matrix = compareTfmEntries(mainResult, comparisonResults);

        // Convert Map to plain object for JSON serialization
        const serializedEntries = matrix.tfmEntries.map((entry) => ({
            tfm: entry.tfm,
            sourceDocuments: entry.sourceDocuments,
            presence: Object.fromEntries(entry.presence),
        }));

        return NextResponse.json({
            tfmEntries: serializedEntries,
            fileNames: matrix.fileNames,
            mainFileName: matrix.mainFileName,
        });
    } catch (error) {
        console.error("Comparison error:", error);
        return NextResponse.json(
            { error: "Kunne ikke utføre sammenligning" },
            { status: 500 }
        );
    }
}
