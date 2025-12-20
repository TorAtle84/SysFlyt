import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { scanFunctionDescription } from "@/lib/pdf-text-extractor";
import { readFile } from "fs/promises";
import path from "path";

/**
 * POST /api/projects/[projectId]/documents/[documentId]/scan-function-description
 * Scan a function description PDF for system codes based on font-size
 */
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

        const document = await prisma.document.findFirst({
            where: {
                id: documentId,
                projectId,
                type: "FUNCTION_DESCRIPTION",
            },
            select: {
                id: true,
                url: true,
                fileUrl: true,
                fileName: true,
                title: true,
            },
        });

        if (!document) {
            return NextResponse.json(
                { error: "Funksjonsbeskrivelse ikke funnet" },
                { status: 404 }
            );
        }

        // Read PDF file
        const fileUrl = document.fileUrl || document.url;
        const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\//, ""));

        let pdfBuffer: Buffer;
        try {
            pdfBuffer = await readFile(filePath);
        } catch (e) {
            console.error("Error reading PDF file:", e);
            return NextResponse.json(
                { error: "Kunne ikke lese PDF-fil" },
                { status: 500 }
            );
        }

        // Scan the function description
        const scanResult = await scanFunctionDescription(
            pdfBuffer,
            document.fileName || document.title || "unknown.pdf"
        );

        // Optionally, save the primary system to the document
        if (scanResult.primarySystem) {
            await prisma.document.update({
                where: { id: documentId },
                data: { primarySystem: scanResult.primarySystem },
            });
        }

        // Create/update system tags for all found systems
        const allSystems = [
            ...(scanResult.primarySystem ? [scanResult.primarySystem] : []),
            ...scanResult.referencedSystems.map(s => s.code),
        ];

        for (const systemCode of allSystems) {
            const tag = await prisma.systemTag.upsert({
                where: { code: systemCode },
                update: {},
                create: { code: systemCode },
            });

            // Link to document if not already linked
            await prisma.documentSystemTag.upsert({
                where: {
                    documentId_systemTagId: {
                        documentId,
                        systemTagId: tag.id,
                    },
                },
                update: {},
                create: {
                    documentId,
                    systemTagId: tag.id,
                },
            });
        }

        return NextResponse.json({
            success: true,
            ...scanResult,
        });

    } catch (error) {
        console.error("Error scanning function description:", error);
        return NextResponse.json(
            { error: "Kunne ikke skanne funksjonsbeskrivelse" },
            { status: 500 }
        );
    }
}
