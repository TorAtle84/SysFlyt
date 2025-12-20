import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; protocolId: string; itemId: string }> }
) {
    try {
        const { projectId, itemId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const comments = await prisma.mCItemComment.findMany({
            where: { itemId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true, // For avatar/gravatar if needed
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        return NextResponse.json({ comments });
    } catch (error) {
        console.error("Error fetching comments:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente kommentarer" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; protocolId: string; itemId: string }> }
) {
    try {
        const { projectId, protocolId, itemId } = await params;
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const body = await request.json();
        const { content, mentions } = body;

        if (!content) {
            return NextResponse.json({ error: "Mangler innhold" }, { status: 400 });
        }

        // Create comment
        const comment = await prisma.mCItemComment.create({
            data: {
                content,
                itemId,
                userId: session.user.id
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        // Handle Notifications
        const rawMentionIds: string[] = Array.isArray(mentions)
            ? mentions.filter((id: unknown): id is string => typeof id === "string")
            : [];

        const uniqueMentionIds = Array.from(new Set(rawMentionIds)).filter((id) => id !== session.user.id);

        if (uniqueMentionIds.length > 0) {
            const [sender, project, protocol, item, eligibleMentionUsers] = await Promise.all([
                prisma.user.findUnique({
                    where: { id: session.user.id },
                    select: { firstName: true, lastName: true },
                }),
                prisma.project.findUnique({
                    where: { id: projectId },
                    select: { name: true },
                }),
                prisma.mCProtocol.findUnique({
                    where: { id: protocolId },
                    select: { systemCode: true, systemName: true },
                }),
                prisma.mCProtocolItem.findUnique({
                    where: { id: itemId },
                    select: {
                        id: true,
                        massList: {
                            select: { tfm: true, system: true, component: true },
                        },
                    },
                }),
                prisma.user.findMany({
                    where: {
                        id: { in: uniqueMentionIds },
                        status: "ACTIVE",
                        OR: [
                            { role: "ADMIN" },
                            { memberships: { some: { projectId } } },
                        ],
                    },
                    select: { id: true },
                }),
            ]);

            const eligibleMentionIds = eligibleMentionUsers.map((u) => u.id);
            if (eligibleMentionIds.length === 0) {
                return NextResponse.json({ comment });
            }

            const senderName = sender
                ? `${sender.firstName} ${sender.lastName}`
                : (session.user.name || session.user.email || "En bruker");

            const projectName = project?.name || "Prosjekt";
            const protocolLabel = protocol?.systemName || protocol?.systemCode || "MC-protokoll";
            const itemLabel =
                item?.massList?.tfm ||
                [item?.massList?.system, item?.massList?.component].filter(Boolean).join("-") ||
                "komponent";

            const link = `/projects/${projectId}/protocols/${protocolId}?item=${itemId}&notes=1&comment=${comment.id}`;
            const messagePreview = String(content).trim().slice(0, 140);

            await prisma.notification.createMany({
                data: eligibleMentionIds.map((userId) => ({
                    userId,
                    type: "mc_mention",
                    read: false,
                    metadata: {
                        projectId,
                        projectName,
                        protocolId,
                        protocolLabel,
                        itemId,
                        itemLabel,
                        commentId: comment.id,
                        senderId: session.user.id,
                        senderName,
                        messagePreview,
                        link,
                    },
                })),
            });
        }

        return NextResponse.json({ comment });
    } catch (error) {
        console.error("Error creating comment:", error);
        return NextResponse.json(
            { error: "Kunne ikke lagre kommentar" },
            { status: 500 }
        );
    }
}
