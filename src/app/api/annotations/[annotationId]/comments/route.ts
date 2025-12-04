import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

async function getUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email } });
}

type Context = { params: Promise<{ annotationId: string }> };

export async function POST(req: NextRequest, context: Context) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { content, mentions = [] } = body || {};
  if (!content) return NextResponse.json({ error: "Innhold mangler" }, { status: 400 });

  const { annotationId } = await context.params;

  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: { document: true },
  });
  if (!annotation) return NextResponse.json({ error: "Annotering ikke funnet" }, { status: 404 });

  const comment = await prisma.comment.create({
    data: {
      content,
      annotationId: annotation.id,
      authorId: user.id,
      projectId: annotation.document.projectId,
    },
    include: { author: true },
  });

  if (Array.isArray(mentions) && mentions.length) {
    await prisma.notification.createMany({
      data: mentions.map((userId: string) => ({
        userId,
        type: "mention",
        commentId: comment.id,
        annotationId: annotation.id,
        metadata: { from: user.id, annotationId: annotation.id },
      })),
    });
  }

  return NextResponse.json(comment);
}
