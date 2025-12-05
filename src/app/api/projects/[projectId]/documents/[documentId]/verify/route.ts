import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { verifyAgainstMassList } from "@/lib/scan";

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

    const document = await prisma.document.findUnique({
      where: { id: documentId, projectId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    const result = await verifyAgainstMassList(projectId, documentId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error verifying document:", error);
    return NextResponse.json(
      { error: "Kunne ikke verifisere dokument" },
      { status: 500 }
    );
  }
}
