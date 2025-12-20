import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, canAnnotateDocuments } from "@/lib/auth-helpers";

type Context = { params: Promise<{ annotationId: string }> };

export async function POST(req: NextRequest, context: Context) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const body = await req.json();
  const { content, mentions = [] } = body || {};
  
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Innhold mangler" }, { status: 400 });
  }

  const { annotationId } = await context.params;

  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: { document: true },
  });

  if (!annotation) {
    return NextResponse.json({ error: "Annotering ikke funnet" }, { status: 404 });
  }

  const membership = await prisma.projectMember.findFirst({
    where: { 
      projectId: annotation.document.projectId, 
      userId: authResult.user.id 
    },
  });

  if (!membership && authResult.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Ingen tilgang til dette prosjektet" }, { status: 403 });
  }

  if (!canAnnotateDocuments(authResult.user.role, membership?.role)) {
    return NextResponse.json({ error: "Ingen tilgang til å kommentere" }, { status: 403 });
  }

  const comment = await prisma.comment.create({
    data: {
      content: content.trim(),
      annotationId: annotation.id,
      authorId: authResult.user.id,
      projectId: annotation.document.projectId,
    },
    include: { author: true },
  });

  if (Array.isArray(mentions) && mentions.length > 0) {
    const rawMentionIds = mentions.filter(
      (userId: unknown): userId is string => typeof userId === "string" && userId.length > 0
    );

    const uniqueMentionIds = Array.from(new Set(rawMentionIds)).filter(
      (userId) => userId !== authResult.user.id
    );

    if (uniqueMentionIds.length > 0) {
      const [sender, project, eligibleMentionUsers] = await Promise.all([
        prisma.user.findUnique({
          where: { id: authResult.user.id },
          select: { firstName: true, lastName: true },
        }),
        prisma.project.findUnique({
          where: { id: annotation.document.projectId },
          select: { name: true },
        }),
        prisma.user.findMany({
          where: {
            id: { in: uniqueMentionIds },
            status: "ACTIVE",
            OR: [
              { role: "ADMIN" },
              {
                memberships: {
                  some: { projectId: annotation.document.projectId },
                },
              },
            ],
          },
          select: { id: true },
        }),
      ]);

      const eligibleMentionIds = eligibleMentionUsers.map((u) => u.id);
      if (eligibleMentionIds.length > 0) {
        const senderName = sender
          ? `${sender.firstName} ${sender.lastName}`
          : "Noen";

        const link = `/projects/${annotation.document.projectId}/documents/${annotation.document.id}?annotationId=${encodeURIComponent(annotation.id)}&comment=${encodeURIComponent(comment.id)}`;

        await prisma.notification.createMany({
          data: eligibleMentionIds.map((userId) => ({
            userId,
            type: "mention",
            commentId: comment.id,
            annotationId: annotation.id,
            metadata: {
              senderName,
              projectName: project?.name ?? undefined,
              documentTitle: annotation.document.title,
              commentId: comment.id,
              annotationId: annotation.id,
              messagePreview: comment.content.slice(0, 120),
              link,
            },
          })),
        });
      }
    }
  }

  return NextResponse.json(comment);
}
