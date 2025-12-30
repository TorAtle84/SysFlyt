import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { startOfWeek, endOfWeek, addWeeks } from "date-fns";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) return authResult.error;

        // Get protocol counts
        const [mcCount, functionTestCount] = await Promise.all([
            prisma.mCProtocol.count({ where: { projectId } }),
            prisma.functionTest.count({ where: { projectId } }),
        ]);

        // Get completion stats (component level)
        const [mcItems, functionTestRows] = await Promise.all([
            prisma.mCProtocolItem.findMany({
                where: { protocol: { projectId } },
                select: { columnA: true, columnB: true, columnC: true },
            }),
            prisma.functionTestRow.findMany({
                where: { test: { projectId } },
                select: { status: true },
            }),
        ]);

        // Count completed MC items (all columns must be COMPLETED)
        const completedMcItems = mcItems.filter(
            (item) =>
                item.columnA === "COMPLETED" &&
                item.columnB === "COMPLETED" &&
                item.columnC === "COMPLETED"
        ).length;

        // Count completed function test rows
        const completedFunctionRows = functionTestRows.filter(
            (row) => row.status === "COMPLETED"
        ).length;

        const totalItems = mcItems.length + functionTestRows.length;
        const completedItems = completedMcItems + completedFunctionRows;

        // Get deviation counts
        const [openDeviations, closedDeviations] = await Promise.all([
            prisma.nCR.count({
                where: { projectId, status: { not: "COMPLETED" } },
            }),
            prisma.nCR.count({
                where: { projectId, status: "COMPLETED" },
            }),
        ]);

        // Get Gantt tasks for this week and next week
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const twoWeeksEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });

        const ganttTasks = await prisma.ganttTask.findMany({
            where: {
                projectId,
                OR: [
                    { startDate: { gte: weekStart, lte: twoWeeksEnd } },
                    { endDate: { gte: weekStart, lte: twoWeeksEnd } },
                    { startDate: { lte: weekStart }, endDate: { gte: twoWeeksEnd } },
                ],
            },
            orderBy: { startDate: "asc" },
            take: 10,
        });

        // Get recent activity (last 5 items from various sources)
        const [recentDocuments, recentComments, recentNcrs] = await Promise.all([
            prisma.document.findMany({
                where: { projectId },
                orderBy: { createdAt: "desc" },
                take: 3,
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                    uploadedBy: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.comment.findMany({
                where: { projectId },
                orderBy: { createdAt: "desc" },
                take: 3,
                select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    author: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.nCR.findMany({
                where: { projectId },
                orderBy: { updatedAt: "desc" },
                take: 3,
                select: {
                    id: true,
                    title: true,
                    status: true,
                    updatedAt: true,
                    reporter: { select: { firstName: true, lastName: true } },
                },
            }),
        ]);

        // Combine and sort activity
        type ActivityItem = {
            type: "document" | "comment" | "ncr";
            message: string;
            user: string;
            timestamp: Date;
        };

        const activities: ActivityItem[] = [
            ...recentDocuments.map((doc) => ({
                type: "document" as const,
                message: `Lastet opp "${doc.name}"`,
                user: doc.uploadedBy
                    ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
                    : "Ukjent",
                timestamp: doc.createdAt,
            })),
            ...recentComments.map((comment) => ({
                type: "comment" as const,
                message: `Kommenterte: "${comment.content.slice(0, 50)}${comment.content.length > 50 ? "..." : ""}"`,
                user: `${comment.author.firstName} ${comment.author.lastName}`,
                timestamp: comment.createdAt,
            })),
            ...recentNcrs.map((ncr) => ({
                type: "ncr" as const,
                message: `Avvik: "${ncr.title}" (${ncr.status === "COMPLETED" ? "Fullført" : "Åpen"})`,
                user: `${ncr.reporter.firstName} ${ncr.reporter.lastName}`,
                timestamp: ncr.updatedAt,
            })),
        ];

        // Sort by timestamp and take top 5
        const recentActivity = activities
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 5);

        return NextResponse.json({
            protocols: {
                mc: mcCount,
                functionTest: functionTestCount,
                total: mcCount + functionTestCount,
            },
            completion: {
                completed: completedItems,
                total: totalItems,
                percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
            },
            deviations: {
                open: openDeviations,
                closed: closedDeviations,
            },
            ganttTasks,
            recentActivity,
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente dashboard-statistikk" },
            { status: 500 }
        );
    }
}
