import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, canAnnotateDocuments } from "@/lib/auth-helpers";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ annotationId: string }> }
) {
    const authResult = await requireAuth();
    if (!authResult.success) {
        return authResult.error;
    }

    const { annotationId } = await params;

    const annotation = await prisma.systemAnnotation.findUnique({
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
        return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    if (!canAnnotateDocuments(authResult.user.role, membership?.role)) {
        return NextResponse.json({ error: "Ingen tilgang til å slette annoteringer" }, { status: 403 });
    }

    await prisma.systemAnnotation.delete({
        where: { id: annotationId },
    });

    return NextResponse.json({ success: true });
}
