
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    // Log entry to ensure route is hit
    try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(process.cwd(), 'search-error.log');
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ENTRY: ${request.url}\n`);
    } catch (e) {
        // ignore
    }

    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { projectId } = await params;
        const { searchParams } = new URL(request.url);
        const typeCode = searchParams.get("typeCode");
        const tfmStartsWith = searchParams.get("tfmStartsWith");

        if (!typeCode && !tfmStartsWith) {
            return NextResponse.json({ items: [] });
        }

        // Check if prisma is available
        if (!prisma) {
            const errorMsg = "Prisma client is undefined";
            console.error(errorMsg);
            try {
                const fs = require('fs');
                const path = require('path');
                const logPath = path.join(process.cwd(), 'search-error.log');
                fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${errorMsg}\n`);
            } catch (e) { }
            return NextResponse.json({ error: "Database connection failed" }, { status: 500 });
        }

        const whereClause: any = {
            protocol: { projectId },
        };

        if (typeCode) {
            whereClause.massList = { typeCode };
        } else if (tfmStartsWith) {
            whereClause.massList = {
                OR: [
                    { tfm: { contains: tfmStartsWith } },
                    { component: { startsWith: tfmStartsWith } }
                ]
            };
        }

        const items = await (prisma as any).mCProtocolItem.findMany({
            where: whereClause,
            select: {
                id: true,
                massList: {
                    select: {
                        tfm: true,
                        typeCode: true,
                        component: true,
                        description: true
                    }
                },
                protocol: {
                    select: {
                        systemName: true
                    }
                },
                product: {
                    select: {
                        name: true
                    }
                }
            },
            take: 100 // Limit to prevent massive payloads
        });

        // Flatten result for easier frontend consumption
        const flattenedItems = items.map((item: any) => ({
            id: item.id,
            tfm: item.massList?.tfm || "Ukjent TFM",
            component: item.massList?.component || "Ukjent Komponent",
            typeCode: item.massList?.typeCode,
            description: item.massList?.description,
            protocolTitle: item.protocol.systemName,
            currentProduct: item.product?.name
        }));

        return NextResponse.json({ items: flattenedItems });
    } catch (error: any) {
        console.error("Error searching items:", error);
        try {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(process.cwd(), 'search-error.log');
            const errorMsg = `[${new Date().toISOString()}] CRASH: ${error.message}\nSTACK: ${error.stack}\n`;
            fs.appendFileSync(logPath, errorMsg);
        } catch (e) {
            console.error("Failed to write to log file", e);
        }
        return NextResponse.json({
            error: "Failed to search items",
            details: error.message
        }, { status: 500 });
    }
}
