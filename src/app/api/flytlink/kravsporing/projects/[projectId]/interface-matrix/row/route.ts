import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncInterfaceMatrix } from "@/lib/interface-matrix-sync";

/**
 * POST - Update row description in FlytLink interface matrix
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
        const { rowId, description } = body;

        if (!rowId) {
            return NextResponse.json({ error: "rowId er påkrevd" }, { status: 400 });
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

        // Verify row belongs to this project's matrix
        const row = await prisma.interfaceMatrixRow.findFirst({
            where: {
                id: rowId,
                matrix: { kravsporingProjectId: projectId },
            },
        });

        if (!row) {
            return NextResponse.json({ error: "Rad ikke funnet" }, { status: 404 });
        }

        // Update row
        const updatedRow = await prisma.interfaceMatrixRow.update({
            where: { id: rowId },
            data: { description },
        });

        // Trigger sync if linked
        if (project.linkedProject) {
            await syncInterfaceMatrix(projectId, "FLYTLINK");
        }

        return NextResponse.json({ row: updatedRow });
    } catch (error) {
        console.error("Error updating row:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere rad" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Remove a row from FlytLink interface matrix
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
        const rowId = searchParams.get("rowId");

        if (!rowId) {
            return NextResponse.json({ error: "rowId er påkrevd" }, { status: 400 });
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

        // Verify row belongs to this project's matrix
        const row = await prisma.interfaceMatrixRow.findFirst({
            where: {
                id: rowId,
                matrix: { kravsporingProjectId: projectId },
            },
        });

        if (!row) {
            return NextResponse.json({ error: "Rad ikke funnet" }, { status: 404 });
        }

        // Delete cells for this row
        await prisma.interfaceMatrixCell.deleteMany({
            where: { rowId },
        });

        // Delete row
        await prisma.interfaceMatrixRow.delete({
            where: { id: rowId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting row:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette rad" },
            { status: 500 }
        );
    }
}
