import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import PDFViewerWrapper from "@/components/pdf-viewer/pdf-viewer-wrapper";
import SaveAndCloseButton from "@/components/pdf-viewer/save-and-close-button";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

interface DeepLinkParams {
  annotationId?: string;
  component?: string;
  x?: number;
  y?: number;
  page?: number;
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
    where: {
      id: documentId,
      projectId,
    },
    include: {
      systemAnnotations: {
        include: {
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!document) return notFound();

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

  if (!project) return notFound();

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

  const formattedSystemAnnotations = document.systemAnnotations.map((a) => ({
    id: a.id,
    type: a.type as "SYSTEM" | "COMMENT",
    systemCode: a.systemCode || undefined,
    content: a.content || undefined,
    mentions: a.mentions || undefined,
    points: (a.points as Array<{ x: number; y: number }>) || undefined,
    x: a.x || undefined,
    y: a.y || undefined,
    width: a.width || undefined,
    height: a.height || undefined,
    color: a.color,
    pageNumber: a.pageNumber,
  }));

  const resolvedSearchParams = await searchParams;
  const deepLink = {
    annotationId: typeof resolvedSearchParams.annotationId === "string"
      ? resolvedSearchParams.annotationId
      : undefined,
    component: typeof resolvedSearchParams.component === "string"
      ? resolvedSearchParams.component
      : undefined,
    x: resolvedSearchParams.x
      ? parseFloat(resolvedSearchParams.x as string)
      : undefined,
    y: resolvedSearchParams.y
      ? parseFloat(resolvedSearchParams.y as string)
      : undefined,
    page: resolvedSearchParams.page
      ? parseInt(resolvedSearchParams.page as string, 10)
      : undefined,
  };

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
          projectId={projectId}
          initialSystemAnnotations={formattedSystemAnnotations}
          canEdit={canEdit}
          initialPage={deepLink.page}
          initialAnnotationId={deepLink.annotationId}
          initialComponent={deepLink.component}
          initialX={deepLink.x}
          initialY={deepLink.y}
        />
      </div>
    </div>
  );
}
