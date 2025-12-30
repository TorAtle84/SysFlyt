import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { downloadFileBuffer } from "@/lib/file-utils";
import { generateNcrPdf } from "@/lib/ncr/pdf-generator";

function detectMimeType(fileUrl: string): "image/png" | "image/jpeg" | null {
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const ncr = await prisma.nCR.findFirst({
      where: { id: ncrId, projectId },
      include: {
        reporter: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true } },
        linkedItem: {
          include: {
            massList: { select: { tfm: true, system: true, component: true } },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        photos: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!ncr) {
      return NextResponse.json({ error: "Avvik ikke funnet" }, { status: 404 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });

    const linkedItemLabel =
      ncr.linkedItem?.massList?.tfm ||
      [ncr.linkedItem?.massList?.system, ncr.linkedItem?.massList?.component]
        .filter(Boolean)
        .join("-") ||
      null;

    const logoPath = path.join(process.cwd(), "public", "SysLinkLogo.png");
    const logoBytes = await fs.readFile(logoPath).catch(() => null);

    const photoEntries = [];
    for (const photo of ncr.photos) {
      const mimeType = detectMimeType(photo.fileUrl);
      if (!mimeType) continue;
      const buffer = await downloadFileBuffer(projectId, photo.fileUrl);
      if (!buffer) continue;
      photoEntries.push({
        bytes: buffer,
        mimeType,
        caption: photo.caption,
      });
    }

    const pdfBytes = await generateNcrPdf({
      projectName: project?.name || "Prosjekt",
      ncr: {
        id: ncr.id,
        title: ncr.title,
        description: ncr.description,
        category: ncr.category,
        severity: ncr.severity,
        status: ncr.status,
        reportedBy: ncr.reporter,
        assignedTo: ncr.assignee,
        linkedItemLabel,
        rootCause: ncr.rootCause,
        corrective: ncr.corrective,
        createdAt: ncr.createdAt,
        closedAt: ncr.closedAt,
      },
      comments: ncr.comments.map((comment) => ({
        content: comment.content,
        createdAt: comment.createdAt,
        user: comment.user,
      })),
      photos: photoEntries,
      logoBytes: logoBytes || undefined,
      logoMimeType: "image/png",
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NCR-${ncr.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating NCR PDF:", error);
    return NextResponse.json({ error: "Kunne ikke generere PDF" }, { status: 500 });
  }
}
