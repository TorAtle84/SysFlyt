import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncInterfaceMatrix } from "@/lib/interface-matrix-sync";

/**
 * POST - Update cell values in FlytLink interface matrix
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
        const { rowId, columnId, values } = body;

        if (!rowId || !columnId) {
            return NextResponse.json({ error: "rowId og columnId er påkrevd" }, { status: 400 });
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

        // Upsert cell
        const existingCell = await prisma.interfaceMatrixCell.findFirst({
            where: { rowId, columnId },
        });

        let cell;
        if (existingCell) {
            cell = await prisma.interfaceMatrixCell.update({
                where: { id: existingCell.id },
                data: { values: values || [] },
            });
        } else {
            cell = await prisma.interfaceMatrixCell.create({
                data: {
                    rowId,
                    columnId,
                    values: values || [],
                },
            });
        }

        // Trigger sync if linked
        if (project.linkedProject) {
            await syncInterfaceMatrix(projectId, "FLYTLINK");
        }

        return NextResponse.json({ cell });
    } catch (error) {
        console.error("Error updating cell:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere celle" },
            { status: 500 }
        );
    }
}
