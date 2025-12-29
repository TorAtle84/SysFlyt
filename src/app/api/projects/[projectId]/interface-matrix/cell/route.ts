import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) return authResult.error;

        // TODO: Verify write access (PROJECT_LEADER or USER?)
        // Assuming Members can edit

        const body = await request.json();
        const { rowId, columnId, values } = body;

        if (!rowId || !columnId || !Array.isArray(values)) {
            return NextResponse.json({ error: "Ugyldige data" }, { status: 400 });
        }

        const cell = await prisma.interfaceMatrixCell.upsert({
            where: {
                rowId_columnId: {
                    rowId,
                    columnId,
                },
            },
            update: {
                values: values,
            },
            create: {
                rowId,
                columnId,
                values: values,
            },
        });

        return NextResponse.json({ cell });
    } catch (error) {
        console.error("Error updating matrix cell:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere celle" },
            { status: 500 }
        );
    }
}
