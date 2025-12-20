import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get("query");
        const supplierId = searchParams.get("supplierId");

        const where: any = {};
        if (supplierId) where.supplierId = supplierId;
        if (query) {
            where.name = {
                contains: query,
                mode: "insensitive",
            };
        }

        const products = await prisma.product.findMany({
            where,
            take: 20,
            orderBy: { name: "asc" },
            include: { supplier: true },
        });

        return NextResponse.json({ products });
    } catch (error) {
        return NextResponse.json(
            { error: "Kunne ikke hente produkter" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, supplierId } = body;

        if (!name || !supplierId) {
            return NextResponse.json(
                { error: "Navn eller leverandør mangler" },
                { status: 400 }
            );
        }

        const product = await prisma.product.create({
            data: { name, supplierId },
        });

        return NextResponse.json({ product });
    } catch (error) {
        return NextResponse.json(
            { error: "Kunne ikke opprette produkt" },
            { status: 500 }
        );
    }
}
