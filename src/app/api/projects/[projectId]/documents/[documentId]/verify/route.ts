import { NextRequest, NextResponse } from "next/server";
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
