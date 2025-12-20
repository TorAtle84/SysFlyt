import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

/**
 * GET /api/projects/[projectId]/documents/[documentId]/components/markers
 * Fetch all component markers for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const { projectId, documentId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page");

    const whereClause: Record<string, unknown> = { documentId };
    if (page) {
      whereClause.page = parseInt(page, 10);
    }

    console.log("[API markers] Query where:", whereClause);

    const markers = await prisma.documentComponent.findMany({
      where: whereClause,
      orderBy: [{ system: "asc" }, { code: "asc" }],
    });

    console.log("[API markers] Found:", markers.length, "markers");
    if (markers.length > 0) {
      console.log("[API markers] First marker:", JSON.stringify(markers[0]));
    }

    return NextResponse.json({ markers });
  } catch (error) {
    console.error("Error fetching markers:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente markører" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/components/markers
 * Update marker positions (single or bulk)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const { projectId, documentId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const body = await request.json();
    const { componentId, componentIds, x, y, page } = body;

    // Single update
    if (componentId) {
      const component = await prisma.documentComponent.update({
        where: { id: componentId, documentId },
        data: { x, y },
      });

      return NextResponse.json({ success: true, component });
    }

    // Bulk update (all on page)
    if (componentIds && Array.isArray(componentIds) && x !== undefined && y !== undefined) {
      // For bulk, we update relative positions
      // This is a simplified version - in production you'd calculate relative offsets
      await prisma.documentComponent.updateMany({
        where: {
          id: { in: componentIds },
          documentId,
        },
        data: { x, y },
      });

      return NextResponse.json({ success: true, updated: componentIds.length });
    }

    return NextResponse.json(
      { error: "componentId or componentIds required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating markers:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere markører" },
      { status: 500 }
    );
  }
}
