/**
 * TFM Comparison API
 * POST: Run comparison on uploaded files OR project documents
 */

import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-helpers";
import {
    TfmSegmentConfig,
    extractTfmFromFile,
    compareTfmEntries,
    TfmExtractionResult,
} from "@/lib/tfm-extractor";
import prisma from "@/lib/db";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

        const contentType = request.headers.get("content-type") || "";

        // Check if this is a project mode request (JSON) or upload mode (FormData)
        if (contentType.includes("application/json")) {
            return handleProjectComparison(request, projectId);
        } else {
            return handleUploadComparison(request, projectId);
        }
    } catch (error) {
        console.error("Comparison error:", error);
        return NextResponse.json(
            { error: "Kunne ikke utføre sammenligning" },
            { status: 500 }
        );
    }
}

// Handle upload mode (FormData with files)
async function handleUploadComparison(request: NextRequest, projectId: string) {
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
}

// Handle project mode (JSON with document IDs)
async function handleProjectComparison(request: NextRequest, projectId: string) {
    const body = await request.json();
    const { mainDocumentId, comparisonDocumentIds, segmentConfig } = body;

    console.log("Project comparison request:", { mainDocumentId, comparisonDocumentIds, segmentConfig, projectId });

    if (!mainDocumentId) {
        return NextResponse.json(
            { error: "Hovedfil (dokumentID) er påkrevd" },
            { status: 400 }
        );
    }

    if (!comparisonDocumentIds || comparisonDocumentIds.length === 0) {
        return NextResponse.json(
            { error: "Minst én sammenligningsfil er påkrevd" },
            { status: 400 }
        );
    }

    if (!segmentConfig) {
        return NextResponse.json(
            { error: "Segmentkonfigurasjon er påkrevd" },
            { status: 400 }
        );
    }

    if (!segmentConfig.byggnr && !segmentConfig.system &&
        !segmentConfig.komponent && !segmentConfig.typekode) {
        return NextResponse.json(
            { error: "Velg minst ett segment" },
            { status: 400 }
        );
    }

    // Fetch documents from database
    const allDocIds = [mainDocumentId, ...comparisonDocumentIds];
    const documents = await prisma.document.findMany({
        where: {
            id: { in: allDocIds },
            projectId,
        },
        select: {
            id: true,
            title: true,
            fileName: true,
            url: true,
        },
    });

    if (documents.length !== allDocIds.length) {
        return NextResponse.json(
            { error: "Ett eller flere dokumenter ble ikke funnet" },
            { status: 404 }
        );
    }

    // Extract TFM from each document
    const extractFromDocument = async (doc: typeof documents[0]): Promise<TfmExtractionResult> => {
        try {
            console.log("Processing document:", { id: doc.id, title: doc.title, url: doc.url });

            // Parse the URL to get bucket and path
            const url = new URL(doc.url);
            const pathParts = url.pathname.split("/").filter(Boolean);
            console.log("URL path parts:", pathParts);

            // Assuming URL format is /storage/v1/object/public/bucket-name/path
            const bucketIndex = pathParts.findIndex(p => p === "public" || p === "sign");
            if (bucketIndex === -1) {
                return {
                    fileName: doc.fileName || doc.title,
                    tfmEntries: [],
                    error: `Ugyldig URL-format: kunne ikke finne 'public' eller 'sign' i URL-stien`,
                };
            }

            const bucket = pathParts[bucketIndex + 1];
            const path = pathParts.slice(bucketIndex + 2).join("/");

            if (!bucket || !path) {
                return {
                    fileName: doc.fileName || doc.title,
                    tfmEntries: [],
                    error: `Ugyldig URL-format: mangler bucket eller path. bucket=${bucket}, path=${path}`,
                };
            }

            console.log("Downloading from Supabase:", { bucket, path });

            const { data, error } = await supabase.storage.from(bucket).download(path);
            if (error || !data) {
                console.error("Supabase download error:", error);
                return {
                    fileName: doc.fileName || doc.title,
                    tfmEntries: [],
                    error: `Kunne ikke laste ned: ${error?.message || "ukjent feil"}`,
                };
            }

            const buffer = Buffer.from(await data.arrayBuffer());
            return await extractTfmFromFile(buffer, doc.fileName || doc.title, segmentConfig);
        } catch (err) {
            console.error("extractFromDocument error:", err);
            return {
                fileName: doc.fileName || doc.title,
                tfmEntries: [],
                error: `Feil ved behandling av dokument: ${err}`,
            };
        }
    };

    // Find main document and comparison documents
    const mainDoc = documents.find(d => d.id === mainDocumentId)!;
    const comparisonDocs = documents.filter(d => d.id !== mainDocumentId);

    const mainResult = await extractFromDocument(mainDoc);
    if (mainResult.error) {
        return NextResponse.json(
            { error: `Feil ved lesing av hovedfil: ${mainResult.error}` },
            { status: 400 }
        );
    }

    const comparisonResults: TfmExtractionResult[] = [];
    for (const doc of comparisonDocs) {
        const result = await extractFromDocument(doc);
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
}
