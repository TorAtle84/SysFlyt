import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { extractTextFromPDF, findComponentsInText } from "@/lib/pdf-text-extractor";
import { readFile } from "fs/promises";
import path from "path";

/**
 * POST /api/projects/[projectId]/documents/[documentId]/components/markers/verify
 * Text-verify component markers
 */
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

    const body = await request.json();
    const { componentIds } = body;

    if (!componentIds || !Array.isArray(componentIds)) {
      return NextResponse.json(
        { error: "componentIds array required" },
        { status: 400 }
      );
    }

    // Get document
    const document = await prisma.document.findUnique({
      where: { id: documentId, projectId },
      select: { url: true },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    // Read PDF
    const filePath = path.join(process.cwd(), "uploads", document.url);
    let pdfBuffer: Buffer;

    try {
      pdfBuffer = await readFile(filePath);
    } catch {
      const altPath = path.join(process.cwd(), document.url);
      pdfBuffer = await readFile(altPath);
    }

    // Extract text and find components
    const { items } = await extractTextFromPDF(pdfBuffer);
    const foundComponents = findComponentsInText(items);

    // Build verification map
    const verificationMap = new Map<string, boolean>();
    for (const comp of foundComponents) {
      verificationMap.set(comp.code, true);
    }

    // Update components
    let verifiedCount = 0;

    for (const componentId of componentIds) {
      const component = await prisma.documentComponent.findUnique({
        where: { id: componentId },
      });

      if (!component) continue;

      const isVerified = verificationMap.has(component.code);

      await prisma.documentComponent.update({
        where: { id: componentId },
        data: {
          verifiedByText: isVerified,
          textConfidence: isVerified ? 1.0 : 0.0,
        },
      });

      if (isVerified) verifiedCount++;
    }

    return NextResponse.json({
      success: true,
      total: componentIds.length,
      verified: verifiedCount,
      unverified: componentIds.length - verifiedCount,
    });
  } catch (error) {
    console.error("Error verifying markers:", error);
    return NextResponse.json(
      { error: "Kunne ikke verifisere markører" },
      { status: 500 }
    );
  }
}
