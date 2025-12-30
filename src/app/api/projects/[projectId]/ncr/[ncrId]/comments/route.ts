import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const comments = await prisma.nCRComment.findMany({
      where: { ncrId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Error fetching NCR comments:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente kommentarer" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const body = await request.json().catch(() => null);
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const mentions = Array.isArray(body?.mentions) ? body.mentions : [];

    if (!content) {
      return NextResponse.json({ error: "Mangler innhold" }, { status: 400 });
    }

    const comment = await prisma.nCRComment.create({
      data: {
        ncrId,
        userId: session.user.id,
        content,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const rawMentionIds: string[] = mentions
      .filter((id: unknown): id is string => typeof id === "string")
      .filter((id: string) => id !== session.user.id);

    const uniqueMentionIds = Array.from(new Set(rawMentionIds));

    if (uniqueMentionIds.length > 0) {
      const [sender, project, ncr, eligibleMentionUsers] = await Promise.all([
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { firstName: true, lastName: true },
        }),
        prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true },
        }),
        prisma.nCR.findFirst({
          where: { id: ncrId, projectId },
          select: { title: true },
        }),
        prisma.user.findMany({
          where: {
            id: { in: uniqueMentionIds },
            status: "ACTIVE",
            OR: [{ role: "ADMIN" }, { memberships: { some: { projectId } } }],
          },
          select: { id: true },
        }),
      ]);

      const eligibleMentionIds = eligibleMentionUsers.map((u) => u.id);
      if (eligibleMentionIds.length > 0) {
        const senderName = sender
          ? `${sender.firstName} ${sender.lastName}`
          : (session.user.name || session.user.email || "En bruker");

        const projectName = project?.name || "Prosjekt";
        const ncrTitle = ncr?.title || "Avvik";
        const link = `/projects/${projectId}/quality-assurance/ncr/${ncrId}?comment=${comment.id}`;
        const messagePreview = content.slice(0, 140);

        await prisma.notification.createMany({
          data: eligibleMentionIds.map((userId) => ({
            userId,
            type: "ncr_mention",
            read: false,
            metadata: {
              projectId,
              projectName,
              ncrId,
              ncrTitle,
              commentId: comment.id,
              senderId: session.user.id,
              senderName,
              messagePreview,
              link,
            },
          })),
        });
      }
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Error creating NCR comment:", error);
    return NextResponse.json(
      { error: "Kunne ikke lagre kommentar" },
      { status: 500 }
    );
  }
}
