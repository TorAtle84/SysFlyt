import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { scanDocumentForSystems } from "@/lib/scan";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const { projectId, documentId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    const scanResult = await scanDocumentForSystems(documentId);
    const systemCodes = Array.from(new Set(scanResult.systems.map((s) => s.code)));

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: { systemTags: systemCodes },
      });

      await tx.documentSystemTag.deleteMany({
        where: { documentId },
      });

      for (const code of systemCodes) {
        const tag = await tx.systemTag.upsert({
          where: { code },
          update: {},
          create: { code },
        });

        await tx.documentSystemTag.create({
          data: {
            documentId,
            systemTagId: tag.id,
          },
        });
      }
    });

    return NextResponse.json({
      ...scanResult,
      systemCodes,
    });
  } catch (error) {
    console.error("Error scanning systems:", error);
    return NextResponse.json(
      { error: "Kunne ikke skanne systemkoder" },
      { status: 500 }
    );
  }
}
