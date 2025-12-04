import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ annotationId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { annotationId } = await params;

    // Check ownership/access via document->project
    const annotation = await prisma.systemAnnotation.findUnique({
        where: { id: annotationId },
        include: { document: true },
    });

    if (!annotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.projectMember.findFirst({
        where: { projectId: annotation.document.projectId, user: { email: session.user.email } },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.systemAnnotation.delete({
        where: { id: annotationId },
    });

    return NextResponse.json({ success: true });
}
