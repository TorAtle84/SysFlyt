import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { DocumentWorkspace } from "@/components/pages/project/document-workspace";
import { Role } from "@prisma/client";

interface FunctionDescriptionsPageProps {
    params: Promise<{ projectId: string }>;
}

export default async function FunctionDescriptionsPage({ params }: FunctionDescriptionsPageProps) {
    const { projectId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/login");
    }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            documents: {
                where: { type: "FUNCTION_DESCRIPTION" },
                orderBy: { createdAt: "desc" },
                include: {
                    systemAnnotations: {
                        select: { id: true, systemCode: true },
                    },
                    tags: {
                        orderBy: { order: "asc" },
                        include: {
                            systemTag: true,
                        },
                    },
                    _count: {
                        select: {
                            annotations: true,
                            components: true,
                        },
                    },
                },
            },
            members: {
                where: { userId: session.user.id },
            },
        },
    });

    if (!project) {
        redirect("/dashboard");
    }

    // Fetch all system tags for the filter dropdown
    const systemTags = await prisma.systemTag.findMany({
        orderBy: { code: "asc" },
    });

    const isAdmin = session.user.role === Role.ADMIN;
    const isMember = project.members.length > 0;

    if (!isAdmin && !isMember) {
        redirect("/dashboard");
    }

    const canUpload =
        isAdmin || project.members.some((m) => m.role !== "READER");

    const formattedDocuments = project.documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        url: doc.url,
        type: doc.type,
        revision: doc.revision,
        isLatest: doc.isLatest,
        approvedDeviations: doc.approvedDeviations,
        primarySystem: doc.primarySystem,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        tags: doc.tags,
        systemAnnotations: doc.systemAnnotations,
        _count: doc._count,
    }));

    return (
        <DocumentWorkspace
            project={project}
            documents={formattedDocuments}
            systemTags={systemTags}
            documentType="FUNCTION_DESCRIPTION"
            canUpload={canUpload}
        />
    );
}
