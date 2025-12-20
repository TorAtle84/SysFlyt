
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    try {
        const body = await request.json();
        const { itemIds, productId } = body;

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return NextResponse.json({ error: "Invalid itemIds" }, { status: 400 });
        }

        // Get product with supplier info if productId is provided
        let product: any = null;
        if (productId) {
            product = await prisma.product.findUnique({
                where: { id: productId },
                include: { supplier: true }
            });
            if (!product) {
                return NextResponse.json({ error: "Product not found" }, { status: 404 });
            }
        }

        // Update items
        const result = await prisma.mCProtocolItem.updateMany({
            where: {
                id: { in: itemIds },
                protocol: { projectId } // Ensure we only touch provided project items
            },
            data: {
                productId: productId
            }
        });

        // Also update the MassList entries for all affected items
        // First, get all the massListIds for the updated items
        const updatedItems = await prisma.mCProtocolItem.findMany({
            where: { id: { in: itemIds } },
            select: { massListId: true }
        });

        const massListIds = updatedItems
            .map(item => item.massListId)
            .filter((id): id is string => id !== null);

        if (massListIds.length > 0) {
            await prisma.massList.updateMany({
                where: { id: { in: massListIds } },
                data: {
                    productName: product?.name || null,
                    supplierName: product?.supplier?.name || null,
                }
            });
        }

        return NextResponse.json({
            success: true,
            count: result.count,
            message: `Updated ${result.count} items`
        });

    } catch (error) {
        console.error("Error bulk updating items:", error);
        return NextResponse.json({ error: "Failed to update items" }, { status: 500 });
    }
}
