import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ProtocolDetail } from "@/components/pages/project/protocol-detail";
import { ModelStatus, Role } from "@prisma/client";

interface ProtocolPageProps {
    params: Promise<{
        projectId: string;
        protocolId: string;
    }>;
}

export default async function ProtocolPage({ params }: ProtocolPageProps) {
    const { projectId, protocolId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/syslink/login");
    }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            members: {
                where: { userId: session.user.id },
            },
        },
    });

    if (!project) {
        redirect("/syslink/dashboard");
    }

    const isAdmin = session.user.role === Role.ADMIN;
    const isMember = project.members.length > 0;

    if (!isAdmin && !isMember) {
        redirect("/syslink/dashboard");
    }

    // Fetch protocol with all necessary data
    const protocol = await prisma.mCProtocol.findUnique({
        where: { id: protocolId },
        include: {
            documents: true,
            items: {
                orderBy: [
                    { massList: { system: "asc" } },
                    { massList: { component: "asc" } },
                ],
                include: {
                    massList: true,
                    responsible: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                    executor: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                    product: {
                        include: {
                            supplier: true,
                            datasheets: true,
                        },
                    },
                    photos: true,
                },
            },
        },
    });

    if (!protocol) {
        redirect(`/projects/${projectId}/protocols`);
    }

    // Phase 3: Fetch linked DocumentComponents for "Jump to PDF" functionality
    // We match against 'component' (raw code) instead of 'tfm' (formatted), as
    // the user confirmed they iterate directly on {system}{component} without prefixes.
    const componentCodes = protocol.items
        .map((item) => item.massList?.component)
        .filter((code): code is string => !!code);

    const fullTags = protocol.items
        .map((item) => {
            const system = item.massList?.system?.trim();
            const component = item.massList?.component?.trim();
            if (!system || !component) return null;
            return `${system}-${component.toUpperCase()}`;
        })
        .filter((t): t is string => !!t);

    const linkedComponents = await prisma.documentComponent.findMany({
        where: {
            code: { in: componentCodes },
            document: { projectId: projectId },
        },
        include: {
            document: {
                select: { id: true, title: true, type: true },
            },
        },
    });

    const linkedModelComponents = fullTags.length > 0 ? await prisma.bimModelComponent.findMany({
        where: {
            fullTag: { in: fullTags },
            model: {
                projectId,
                status: ModelStatus.READY,
            },
        },
        include: {
            model: { select: { id: true, name: true } },
        },
    }) : [];

    // Map components to items
    const itemsWithLinks = protocol.items.map((item) => {
        // Find ALL components matching the raw code
        const components = linkedComponents.filter(
            (c) => c.code === item.massList?.component
        );

        const system = item.massList?.system?.trim();
        const component = item.massList?.component?.trim();
        const fullTag = system && component ? `${system}-${component.toUpperCase()}` : null;
        const modelMatches = fullTag ? linkedModelComponents.filter((mc) => mc.fullTag === fullTag) : [];
        return {
            ...item,
            linkedDocuments: components.map(c => ({
                docId: c.documentId,
                page: c.page || 1,
                x: c.x,
                y: c.y,
                docTitle: c.document.title,
                docType: c.document.type
            })),
            linkedModels: modelMatches.map((mc) => ({
                modelId: mc.modelId,
                modelName: mc.model.name,
                componentId: mc.id,
                fullTag: mc.fullTag,
                systemCode: mc.systemCode,
                componentTag: mc.componentTag,
            })),
        };
    });

    const protocolWithLinks = {
        ...protocol,
        items: itemsWithLinks,
    };

    // Fetch project members for assignment dropdowns
    const projectMembers = await prisma.projectMember.findMany({
        where: { projectId },
        include: {
            user: {
                select: { id: true, firstName: true, lastName: true },
            },
        },
    });

    return (
        <ProtocolDetail
            project={{ id: project.id, name: project.name }}
            protocol={protocolWithLinks}
            members={projectMembers.map(pm => pm.user)}
            userId={session.user.id}
        />
    );
}
