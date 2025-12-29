import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { generateInterfaceMatrixPdf } from "@/lib/interface-matrix/pdf-generator";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) return authResult.error;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });

        const matrix = await prisma.interfaceMatrix.findUnique({
            where: { projectId },
            include: {
                rows: {
                    orderBy: { sortOrder: "asc" },
                    include: { cells: true },
                },
                columns: {
                    orderBy: { sortOrder: "asc" },
                },
            },
        });

        if (!matrix || !project) {
            return NextResponse.json({ error: "Matrise ikke funnet" }, { status: 404 });
        }

        const pdfBytes = await generateInterfaceMatrixPdf({
            rows: matrix.rows,
            columns: matrix.columns,
            projectName: project.name,
        });

        return new NextResponse(pdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="Grensesnittmatrise - ${project.name}.pdf"`,
            },
        });

    } catch (error) {
        console.error("Error generating PDF:", error);
        return NextResponse.json(
            { error: "Kunne ikke generere PDF" },
            { status: 500 }
        );
    }
}
