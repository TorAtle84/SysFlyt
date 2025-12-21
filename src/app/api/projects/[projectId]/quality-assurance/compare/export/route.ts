/**
 * Excel Export API
 * POST: Generate and download Excel file from comparison data
 */

import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { generateComparisonExcel } from "@/lib/excel-export";
import type { ComparisonMatrix } from "@/lib/tfm-extractor";

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
        const { comparison, name } = body;

        if (!comparison) {
            return NextResponse.json(
                { error: "Sammenligninsdata mangler" },
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

        // Generate Excel
        const excelBuffer = generateComparisonExcel(matrix, name || "Sammenligning");

        // Return as downloadable file (convert Buffer to Uint8Array for NextResponse)
        return new NextResponse(new Uint8Array(excelBuffer), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(name || "sammenligning")}.xlsx"`,
            },
        });
    } catch (error) {
        console.error("Export error:", error);
        return NextResponse.json(
            { error: "Kunne ikke eksportere til Excel" },
            { status: 500 }
        );
    }
}
