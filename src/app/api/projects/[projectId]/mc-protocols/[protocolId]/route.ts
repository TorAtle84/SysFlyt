import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function GET(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const protocol = await prisma.mCProtocol.findUnique({
            where: { id: protocolId },
            include: {
                documents: true, // System documents
                items: {
                    orderBy: [
                        { massList: { system: "asc" } },
                        { massList: { component: "asc" } },
                    ],
                    include: {
                        massList: true, // Component info
                        responsible: {
                            select: { id: true, firstName: true, lastName: true },
                        },
                        executor: {
                            select: { id: true, firstName: true, lastName: true },
                        },
                        product: {
                            include: {
                                supplier: true,
                                datasheets: true,
                            },
                        },
                        photos: true,
                    },
                },
            },
        });

        if (!protocol) {
            return NextResponse.json({ error: "Protokoll ikke funnet" }, { status: 404 });
        }

        return NextResponse.json({ protocol });
    } catch (error) {
        console.error("Error fetching protocol:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente protokoll" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const body = await request.json();
        const { systemOwnerId, status, startTime, endTime, assignedUserId, cascade } = body;

        // Start transaction if cascade is needed
        const result = await prisma.$transaction(async (tx) => {
            const updatedProtocol = await tx.mCProtocol.update({
                where: { id: protocolId },
                data: {
                    systemOwnerId: systemOwnerId, // Can be undefined, which Prisma ignores
                    status: status,
                    startTime: startTime ? new Date(startTime) : startTime,
                    endTime: endTime ? new Date(endTime) : endTime,
                    assignedUserId: assignedUserId,
                },
            });

            // If cascade is true and assignedUserId is provided (could be null to clear)
            if (cascade && assignedUserId !== undefined) {
                await tx.mCProtocolItem.updateMany({
                    where: { protocolId: protocolId },
                    data: {
                        executorId: assignedUserId,
                    },
                });
            }

            return updatedProtocol;
        });

        return NextResponse.json({ protocol: result });
    } catch (error) {
        console.error("Error updating protocol:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere protokoll" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        await prisma.mCProtocol.delete({
            where: { id: protocolId },
        });

        return NextResponse.json({ message: "Protokoll slettet" });
    } catch (error) {
        console.error("Error deleting protocol:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette protokoll" },
            { status: 500 }
        );
    }
}
