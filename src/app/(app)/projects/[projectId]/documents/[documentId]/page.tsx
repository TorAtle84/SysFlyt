import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import PDFViewerWrapper from "@/components/pdf-viewer/pdf-viewer-wrapper";
import SaveAndCloseButton from "@/components/pdf-viewer/save-and-close-button";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DocumentPage({
    params,
}: {
    params: Promise<{ projectId: string; documentId: string }>;
}) {
    const session = await getServerSession(authOptions);
    const { projectId, documentId } = await params;

    const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
            systemAnnotations: {
                include: {
                    createdBy: true,
                    comments: {
                        include: {
                            author: true
                        },
                        orderBy: { createdAt: "asc" }
                    }
                },
                orderBy: { createdAt: "asc" }
            }
        },
    });

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            members: {
                include: {
                    user: true
                }
            }
        }
    });

    if (!document || !project) return notFound();

    const members = project.members.map(m => ({
        id: m.user.id,
        name: `${m.user.firstName} ${m.user.lastName}`,
        email: m.user.email
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
                    initialAnnotations={document.systemAnnotations}
                    projectMembers={members}
                    currentUserEmail={session?.user?.email || undefined}
                />
            </div>
        </div>
    );
}
