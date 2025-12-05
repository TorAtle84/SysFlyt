import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import PDFViewerWrapper from "@/components/pdf-viewer/pdf-viewer-wrapper";
import SaveAndCloseButton from "@/components/pdf-viewer/save-and-close-button";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    notFound();
  }

  const { projectId, documentId } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    notFound();
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      annotations: {
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          comments: {
            include: {
              author: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!document || !project) return notFound();

  const membership = project.members.find((m) => m.userId === user.id);
  const isMember = !!membership || user.role === Role.ADMIN;

  if (!isMember) {
    notFound();
  }

  const canEdit =
    user.role === Role.ADMIN ||
    user.role === Role.PROJECT_LEADER ||
    membership?.role === Role.PROJECT_LEADER ||
    membership?.role === Role.USER;

  const members = project.members.map((m) => ({
    id: m.user.id,
    name: `${m.user.firstName} ${m.user.lastName}`,
    email: m.user.email,
  }));

  const formattedAnnotations = document.annotations.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    status: a.status,
    author: a.author,
    comments: a.comments.map((c) => ({
      id: c.id,
      content: c.content,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center p-4 border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <h1 className="text-xl font-bold text-foreground">{document.title}</h1>
        <SaveAndCloseButton
          projectId={projectId}
          documentId={documentId}
          systemTags={document.systemTags}
        />
      </div>
      <div className="flex-1 relative overflow-hidden">
        <PDFViewerWrapper
          url={document.url}
          systemTags={document.systemTags}
          documentId={documentId}
          initialAnnotations={formattedAnnotations}
          projectMembers={members}
          currentUserEmail={session?.user?.email || undefined}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
