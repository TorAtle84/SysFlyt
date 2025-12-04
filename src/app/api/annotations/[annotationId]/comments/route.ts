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
    const validMentions = mentions.filter(
      (userId: unknown) => typeof userId === "string" && userId.length > 0
    );

    if (validMentions.length > 0) {
      await prisma.notification.createMany({
        data: validMentions.map((userId: string) => ({
          userId,
          type: "mention",
          commentId: comment.id,
          annotationId: annotation.id,
          metadata: { from: authResult.user.id, annotationId: annotation.id },
        })),
      });
    }
  }

  return NextResponse.json(comment);
}
