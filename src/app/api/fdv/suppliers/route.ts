import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get("query");

        if (!query) {
            // Return top 20 or something default
            const suppliers = await prisma.supplier.findMany({
                take: 20,
                orderBy: { name: "asc" },
            });
            return NextResponse.json({ suppliers });
        }

        const suppliers = await prisma.supplier.findMany({
            where: {
                name: {
                    contains: query,
                    mode: "insensitive",
                },
            },
            take: 20,
            orderBy: { name: "asc" },
        });

        return NextResponse.json({ suppliers });
    } catch (error) {
        return NextResponse.json(
            { error: "Kunne ikke hente leverandører" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: "Navn mangler" }, { status: 400 });
        }

        const supplier = await prisma.supplier.create({
            data: { name },
        });

        return NextResponse.json({ supplier });
    } catch (error) {
        // If unique constraint failed, return existing
        if ((error as any).code === "P2002") {
            const existing = await prisma.supplier.findUnique({
                where: { name: (await request.json()).name }
            });
            return NextResponse.json({ supplier: existing });
        }
        return NextResponse.json(
            { error: "Kunne ikke opprette leverandør" },
            { status: 500 }
        );
    }
}
