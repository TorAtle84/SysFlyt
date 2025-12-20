import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectLeaderAccess } from "@/lib/auth-helpers";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const { projectId, documentId } = await params;

        // Verify access
        const authResult = await requireProjectLeaderAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const body = await request.json();
        const { components } = body;

        // Validate input
        if (!Array.isArray(components)) {
            return NextResponse.json(
                { error: "Invalid format: components must be an array" },
                { status: 400 }
            );
        }

        // We replace the components list for this document
        // Transaction: Delete existing -> Create new (to handle order and deletions easily)
        // Or upsert if we want to keep IDs. 
        // "Delete all and re-create" is simplest for reordering if we don't track history extensively.
        // However, massListMatch might imply we should be careful. 
        // But scan results are transient until verified? 
        // Let's assume re-creation is fine for this list as it's primarily derived data + manual adjust.
        // Actually, DocumentComponent has an ID. If we delete and recreate, we lose the ID.
        // But the user interface just sends the current state.

        await prisma.$transaction(async (tx) => {
            // 1. Delete all existing components for this document
            await tx.documentComponent.deleteMany({
                where: { documentId },
            });

            // 2. Create new components with order, preserving coordinates
            if (components.length > 0) {
                await tx.documentComponent.createMany({
                    data: components.map((comp: any, index: number) => ({
                        documentId,
                        code: comp.code,
                        system: comp.system || null,
                        order: index,
                        // Preserve coordinate fields
                        x: comp.x ?? null,
                        y: comp.y ?? null,
                        width: comp.width ?? null,
                        height: comp.height ?? null,
                        page: comp.page ?? null,
                        verifiedByText: comp.verifiedByText ?? false,
                        textConfidence: comp.textConfidence ?? 0,
                    }))
                });
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving components:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
