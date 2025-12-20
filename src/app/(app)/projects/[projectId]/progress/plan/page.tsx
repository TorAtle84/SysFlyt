import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { Role } from "@prisma/client";
import { GanttChart } from "@/components/pages/project/progress/gantt-chart";

interface FremdriftsplanPageProps {
    params: Promise<{ projectId: string }>;
}

export default async function FremdriftsplanPage({ params }: FremdriftsplanPageProps) {
    const { projectId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/login");
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
        redirect("/dashboard");
    }

    const isAdmin = session.user.role === Role.ADMIN;
    const isMember = project.members.length > 0;

    if (!isAdmin && !isMember) {
        redirect("/dashboard");
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                    <h1 className="text-2xl font-bold">Fremdriftsplan</h1>
                    <p className="text-sm text-muted-foreground">
                        Gantt-diagram over protokoller og funksjonstester med planlagte datoer
                    </p>
                </div>
            </div>
            <div className="flex-1 overflow-hidden">
                <GanttChart projectId={projectId} />
            </div>
        </div>
    );
}
