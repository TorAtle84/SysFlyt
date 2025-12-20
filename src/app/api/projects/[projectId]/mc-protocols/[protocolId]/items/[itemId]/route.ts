import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function PUT(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
            itemId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId, itemId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const body = await request.json();
        const { columnA, columnB, columnC, notes, responsibleId, executorId, productId } = body;

        // Check if the item exists
        const existingItem = await prisma.mCProtocolItem.findUnique({
            where: { id: itemId },
        });

        if (!existingItem) {
            return NextResponse.json({ error: "Element ikke funnet" }, { status: 404 });
        }

        // Determine completion status for this item
        const newColumnA = columnA || existingItem.columnA;
        const newColumnB = columnB || existingItem.columnB;
        const newColumnC = columnC || existingItem.columnC;

        const isItemComplete =
            (newColumnA === "COMPLETED" || newColumnA === "NA") &&
            (newColumnB === "COMPLETED" || newColumnB === "NA") &&
            (newColumnC === "COMPLETED" || newColumnC === "NA");

        const completedAt = isItemComplete ? new Date() : null;

        // Update the item
        const updatedItem = await prisma.mCProtocolItem.update({
            where: { id: itemId },
            data: {
                columnA: newColumnA,
                columnB: newColumnB,
                columnC: newColumnC,
                notes: notes !== undefined ? notes : existingItem.notes,
                responsibleId: responsibleId !== undefined ? responsibleId : existingItem.responsibleId,
                executorId: executorId !== undefined ? executorId : existingItem.executorId,
                productId: productId !== undefined ? productId : existingItem.productId,
                completedAt,
            },
            include: {
                massList: true,
            },
        });

        // If productId was changed, update the MassList with product and supplier info
        if (productId !== undefined && updatedItem.massListId) {
            if (productId) {
                // Get product with supplier info
                const product = await prisma.product.findUnique({
                    where: { id: productId },
                    include: { supplier: true },
                });
                if (product) {
                    await prisma.massList.update({
                        where: { id: updatedItem.massListId },
                        data: {
                            productName: product.name,
                            supplierName: product.supplier?.name || null,
                        },
                    });
                }
            } else {
                // Product was removed, clear the MassList fields
                await prisma.massList.update({
                    where: { id: updatedItem.massListId },
                    data: {
                        productName: null,
                        supplierName: null,
                    },
                });
            }
        }

        // Check if ALL items in the protocol are now complete
        const allItems = await prisma.mCProtocolItem.findMany({
            where: { protocolId },
            select: {
                columnA: true,
                columnB: true,
                columnC: true,
            },
        });

        const allComplete = allItems.every(
            (i) =>
                (i.columnA === "COMPLETED" || i.columnA === "NA") &&
                (i.columnB === "COMPLETED" || i.columnB === "NA") &&
                (i.columnC === "COMPLETED" || i.columnC === "NA")
        );

        if (allComplete) {
            // Mark protocol as COMPLETED if not already
            const protocol = await prisma.mCProtocol.findUnique({
                where: { id: protocolId },
                select: { status: true, systemCode: true },
            });

            if (protocol && protocol.status !== "COMPLETED" && protocol.status !== "APPROVED") {
                await prisma.mCProtocol.update({
                    where: { id: protocolId },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                    },
                });

                // Notify Project Leader (creator of project)
                const project = await prisma.project.findUnique({
                    where: { id: projectId },
                    select: { createdById: true },
                });

                if (project && project.createdById) {
                    // Use Prisma's create instead of assuming Notification model has create (it does)
                    await prisma.notification.create({
                        data: {
                            userId: project.createdById,
                            type: "MC_COMPLETED",
                            metadata: {
                                message: `MC-protokoll for system ${protocol.systemCode} er 100% fullført`
                            },
                            read: false,
                            // Add link to protocol? Assuming Notification model might support metadata or link in future
                            // For now just message
                        },
                    });
                }
            }
        } else {
            // If not all complete, ensure protocol status is IN_PROGRESS (if it was COMPLETED before)
            const protocol = await prisma.mCProtocol.findUnique({
                where: { id: protocolId },
                select: { status: true },
            });
            if (protocol && protocol.status === "COMPLETED") {
                await prisma.mCProtocol.update({
                    where: { id: protocolId },
                    data: { status: "IN_PROGRESS", completedAt: null }
                });
            }
        }

        return NextResponse.json({ item: updatedItem });
    } catch (error) {
        console.error("Error updating MC item:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere element" },
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
            itemId: string;
        }>;
    }
) {
    try {
        const { projectId, itemId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const existingItem = await (prisma as any).mCProtocolItem.findUnique({
            where: { id: itemId },
        });

        if (!existingItem) {
            return NextResponse.json({ error: "Element ikke funnet" }, { status: 404 });
        }

        await (prisma as any).mCProtocolItem.delete({
            where: { id: itemId },
        });

        return NextResponse.json({ message: "Slettet" });
    } catch (error: any) {
        console.error("Error deleting MC item:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette element", details: error.message },
            { status: 500 }
        );
    }
}
