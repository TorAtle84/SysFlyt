import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const userId = session.user.id;

        // Calculate date 30 days ago for history
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Fetch aggregation for totals
        const totals = await prisma.linkDogUsage.aggregate({
            where: { userId },
            _sum: {
                costUsd: true,
                inputTokens: true,
                outputTokens: true
            },
            _count: {
                id: true
            }
        });

        // Fetch raw data for history graph (last 30 days)
        // Grouping by date in code is easier across DB types than raw SQL for now
        const usageHistory = await prisma.linkDogUsage.findMany({
            where: {
                userId,
                createdAt: { gte: thirtyDaysAgo }
            },
            select: {
                createdAt: true,
                costUsd: true,
                provider: true,
                model: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        // Group by day
        const historyMap = new Map<string, number>();
        usageHistory.forEach(record => {
            const date = record.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
            const cost = record.costUsd || 0;
            historyMap.set(date, (historyMap.get(date) || 0) + cost);
        });

        // Fill in missing days
        const graphData = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            graphData.push({
                date: dateStr,
                costUsd: historyMap.get(dateStr) || 0,
                costNok: (historyMap.get(dateStr) || 0) * 11.0 // Approx exchange rate
            });
        }

        const totalCostUsd = totals._sum.costUsd || 0;

        return NextResponse.json({
            totalRequests: totals._count.id,
            totalInputTokens: totals._sum.inputTokens || 0,
            totalOutputTokens: totals._sum.outputTokens || 0,
            totalCostUsd: totalCostUsd,
            totalCostNok: totalCostUsd * 11.0,
            history: graphData
        });

    } catch (error) {
        console.error("Error fetching LinkDog stats:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente statistikk" },
            { status: 500 }
        );
    }
}
