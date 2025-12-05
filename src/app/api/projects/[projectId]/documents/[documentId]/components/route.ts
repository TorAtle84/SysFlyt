import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { scanDocumentForComponents, saveComponentsToDocument } from "@/lib/scan";

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

    const document = await prisma.document.findUnique({
      where: { id: documentId, projectId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rescan = searchParams.get("rescan") === "true";

    if (rescan) {
      const scanResult = await scanDocumentForComponents(documentId);
      await saveComponentsToDocument(documentId, scanResult.components);
    }

    const components = await prisma.documentComponent.findMany({
      where: { documentId },
      orderBy: [{ system: "asc" }, { code: "asc" }],
    });

    const massList = await prisma.massList.findMany({
      where: { projectId },
      select: {
        id: true,
        tfm: true,
        system: true,
        component: true,
        productName: true,
        location: true,
      },
    });

    const componentsWithMatch = components.map((comp) => {
      const normalizedCode = comp.code.replace(/[.\-_]/g, "").toLowerCase();
      
      const massListMatch = massList.find((m) => {
        const tfmNorm = (m.tfm || "").replace(/[.\-_]/g, "").toLowerCase();
        const compNorm = (m.component || "").replace(/[.\-_]/g, "").toLowerCase();
        
        return (
          tfmNorm.includes(normalizedCode) ||
          normalizedCode.includes(tfmNorm) ||
          compNorm === normalizedCode ||
          (m.system && comp.system && m.system === comp.system)
        );
      });

      return {
        ...comp,
        massListMatch: massListMatch || null,
      };
    });

    return NextResponse.json({
      components: componentsWithMatch,
      total: components.length,
      matched: componentsWithMatch.filter((c) => c.massListMatch).length,
    });
  } catch (error) {
    console.error("Error fetching components:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente komponenter" },
      { status: 500 }
    );
  }
}

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

    const scanResult = await scanDocumentForComponents(documentId);
    const savedCount = await saveComponentsToDocument(documentId, scanResult.components);

    return NextResponse.json({
      success: true,
      scannedCount: scanResult.components.length,
      savedCount,
      systemCodes: scanResult.systemCodes,
    });
  } catch (error) {
    console.error("Error scanning components:", error);
    return NextResponse.json(
      { error: "Kunne ikke skanne komponenter" },
      { status: 500 }
    );
  }
}

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

    const document = await prisma.document.findUnique({
      where: { id: documentId, projectId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { componentId, system } = body;

    if (!componentId) {
      return NextResponse.json(
        { error: "componentId er påkrevd" },
        { status: 400 }
      );
    }

    const existingComponent = await prisma.documentComponent.findFirst({
      where: { id: componentId, documentId },
    });

    if (!existingComponent) {
      return NextResponse.json(
        { error: "Komponent ikke funnet" },
        { status: 404 }
      );
    }

    const component = await prisma.documentComponent.update({
      where: { id: componentId },
      data: { system },
    });

    return NextResponse.json(component);
  } catch (error) {
    console.error("Error updating component:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere komponent" },
      { status: 500 }
    );
  }
}
