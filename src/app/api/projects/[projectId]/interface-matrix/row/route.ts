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

        const body = await request.json();
        const { rowId, description } = body;

        if (!rowId) {
            return NextResponse.json({ error: "Mangler rowId" }, { status: 400 });
        }

        const row = await prisma.interfaceMatrixRow.update({
            where: { id: rowId },
            data: {
                description: description,
            },
        });

        return NextResponse.json({ row });
    } catch (error) {
        console.error("Error updating matrix row:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere rad" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) return authResult.error;

        const { searchParams } = new URL(request.url);
        const rowId = searchParams.get("rowId");

        if (!rowId) {
            return NextResponse.json({ error: "Mangler rowId" }, { status: 400 });
        }

        // Delete row (cells will cascade delete due to schema)
        await prisma.interfaceMatrixRow.delete({
            where: { id: rowId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting matrix row:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette rad" },
            { status: 500 }
        );
    }
}
