import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { generatePlansystemPdf } from "@/lib/function-tests/plansystem-pdf";

export const runtime = "nodejs";

function buildContentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: NextRequest,
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

    if (!project) {
      return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
    }

    const tests = await prisma.functionTest.findMany({
      where: { projectId },
      orderBy: { systemCode: "asc" },
      include: {
        systemOwner: { select: { firstName: true, lastName: true } },
        responsibles: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const { bytes, fileName } = await generatePlansystemPdf({
      projectName: project.name,
      tests: tests.map((t) => ({
        systemCode: t.systemCode,
        systemName: t.systemName,
        systemOwner: t.systemOwner,
        systemOwnerDiscipline: t.systemOwnerDiscipline,
        softwareResponsible: t.softwareResponsible,
        dates: t.dates,
        responsibles: t.responsibles.map((r) => ({
          systemCode: r.systemCode,
          discipline: r.discipline,
          testParticipation: r.testParticipation,
          prerequisites: r.prerequisites,
          user: r.user,
        })),
      })),
    });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(fileName),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error generating Plansystem PDF:", error);
    return NextResponse.json(
      { error: "Kunne ikke generere Plansystem PDF" },
      { status: 500 }
    );
  }
}

