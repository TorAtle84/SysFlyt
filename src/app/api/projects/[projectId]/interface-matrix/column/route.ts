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
        const { label, color } = body;

        if (!label || !color) {
            return NextResponse.json({ error: "Mangler navn eller farge" }, { status: 400 });
        }

        const matrix = await prisma.interfaceMatrix.findUnique({ where: { projectId } });
        if (!matrix) return NextResponse.json({ error: "Matrix not found" }, { status: 404 });

        const maxSort = await prisma.interfaceMatrixColumn.aggregate({
            where: { matrixId: matrix.id },
            _max: { sortOrder: true }
        });

        const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

        const column = await prisma.interfaceMatrixColumn.create({
            data: {
                matrixId: matrix.id,
                customLabel: label,
                color: color,
                sortOrder: sortOrder,
                discipline: label, // Using label as discipline code for custom columns for now
            },
        });

        return NextResponse.json({ column });
    } catch (error) {
        console.error("Error creating column:", error);
        return NextResponse.json(
            { error: "Kunne ikke opprette motpart" },
            { status: 500 }
        );
    }
}
