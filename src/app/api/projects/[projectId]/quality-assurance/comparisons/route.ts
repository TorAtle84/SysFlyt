/**
 * Saved Comparisons API
 * GET: List saved comparisons
 * POST: Save new comparison
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { generateComparisonExcel, generateExportFileName } from "@/lib/excel-export";
import type { ComparisonMatrix } from "@/lib/tfm-extractor";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET_NAME = "documents";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const comparisons = await prisma.tfmComparison.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: { firstName: true, lastName: true },
                },
            },
        });

        return NextResponse.json(comparisons);
    } catch (error) {
        console.error("Error fetching comparisons:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente sammenligninger" },
            { status: 500 }
        );
    }
}

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

        const body = await request.json();
        const { name, comparison, segmentConfig } = body;

        if (!name || !comparison) {
            return NextResponse.json(
                { error: "Navn og sammenligningsdata er påkrevd" },
                { status: 400 }
            );
        }

        // Reconstruct ComparisonMatrix with Maps
        const matrix: ComparisonMatrix = {
            tfmEntries: comparison.tfmEntries.map((entry: {
                tfm: string;
                sourceDocuments: string[];
                presence: Record<string, boolean>;
            }) => ({
                tfm: entry.tfm,
                sourceDocuments: entry.sourceDocuments,
                presence: new Map(Object.entries(entry.presence)),
            })),
            fileNames: comparison.fileNames,
            mainFileName: comparison.mainFileName,
        };

        // Generate Excel file
        const excelBuffer = generateComparisonExcel(matrix, name);
        const fileName = generateExportFileName(name);
        const storagePath = `${projectId}/comparisons/${fileName}`;

        // Upload to Supabase Storage
        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                { error: "Storage ikke konfigurert" },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, excelBuffer, {
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                upsert: true,
            });

        if (uploadError) {
            console.error("Upload error:", uploadError);
            return NextResponse.json(
                { error: "Kunne ikke laste opp fil" },
                { status: 500 }
            );
        }

        // Save to database
        const savedComparison = await prisma.tfmComparison.create({
            data: {
                name,
                projectId,
                fileUrl: `/api/files/${projectId}/comparisons/${fileName}`,
                segmentConfig: JSON.stringify(segmentConfig),
                createdById: authResult.user.id,
            },
        });

        return NextResponse.json(savedComparison);
    } catch (error) {
        console.error("Error saving comparison:", error);
        // Return detailed error in development
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorStack = error instanceof Error ? error.stack : "";
        console.error("Error details:", { message: errorMessage, stack: errorStack });
        return NextResponse.json(
            { error: "Kunne ikke lagre sammenligning", details: errorMessage },
            { status: 500 }
        );
    }
}
