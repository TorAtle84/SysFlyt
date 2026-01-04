import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncInterfaceMatrix } from "@/lib/interface-matrix-sync";

/**
 * POST - Add a new column (discipline) to FlytLink interface matrix
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const { projectId } = await params;
        const body = await request.json();
        const { label, color } = body;

        if (!label) {
            return NextResponse.json({ error: "Fagnavn er påkrevd" }, { status: 400 });
        }

        // Verify user owns this project
        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
            include: { linkedProject: true },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Get matrix
        let matrix = await prisma.interfaceMatrix.findUnique({
            where: { kravsporingProjectId: projectId },
        });

        if (!matrix) {
            matrix = await prisma.interfaceMatrix.create({
                data: { kravsporingProjectId: projectId },
            });
        }

        // Get current max sort order
        const maxSort = await prisma.interfaceMatrixColumn.findFirst({
            where: { matrixId: matrix.id },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
        });

        // Create column
        const column = await prisma.interfaceMatrixColumn.create({
            data: {
                matrixId: matrix.id,
                customLabel: label,
                color: color || "#E2E8F0",
                sortOrder: (maxSort?.sortOrder ?? -1) + 1,
            },
        });

        // Trigger sync if linked
        if (project.linkedProject) {
            await syncInterfaceMatrix(projectId, "FLYTLINK");
        }

        return NextResponse.json({ column });
    } catch (error) {
        console.error("Error adding column:", error);
        return NextResponse.json(
            { error: "Kunne ikke legge til fag" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Remove a column from FlytLink interface matrix
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const { projectId } = await params;
        const { searchParams } = new URL(request.url);
        const columnId = searchParams.get("columnId");

        if (!columnId) {
            return NextResponse.json({ error: "columnId er påkrevd" }, { status: 400 });
        }

        // Verify user owns this project
        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Verify column belongs to this project's matrix
        const column = await prisma.interfaceMatrixColumn.findFirst({
            where: {
                id: columnId,
                matrix: { kravsporingProjectId: projectId },
            },
        });

        if (!column) {
            return NextResponse.json({ error: "Kolonne ikke funnet" }, { status: 404 });
        }

        // Delete cells for this column
        await prisma.interfaceMatrixCell.deleteMany({
            where: { columnId },
        });

        // Delete column
        await prisma.interfaceMatrixColumn.delete({
            where: { id: columnId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting column:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette fag" },
            { status: 500 }
        );
    }
}
