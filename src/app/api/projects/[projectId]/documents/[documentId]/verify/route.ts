import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { scanDocumentForComponents } from "@/lib/scan";
import { getTFMVariants, normalizeComponentCode, normalizeSystemCode } from "@/lib/tfm-id";
import type { ParsedComponent } from "@/lib/id-pattern";

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

    const body = await request.json().catch(() => ({}));
    const { enableGeometry, save } = body;

    // Scan document for components
    const scanResult = await scanDocumentForComponents(documentId, {
      enableGeometry: enableGeometry === true,
    });

    if (save) {
      // Save scanned components to database
      await import("@/lib/scan").then(m => m.saveComponentsToDocument(documentId, scanResult.components));
    }

    // Fetch mass list for project
    const massList = await prisma.massList.findMany({
      where: { projectId },
      select: {
        id: true,
        tfm: true,
        building: true,
        system: true,
        component: true,
        typeCode: true,
        productName: true,
        location: true,
        zone: true,
      },
    });

    // Convert ExtractedComponent to ParsedComponent format
    const scannedComponents: ParsedComponent[] = scanResult.components.map((comp) => ({
      code: comp.code,
      system: comp.system,
      byggnr: null,
      typeCode: null,
      confidence: comp.confidence || 0.7,
      matchType: "default" as const,
    }));

    // Perform verification using TFM variants
    const normalize = (val?: string | null) =>
      val ? val.toString().toUpperCase().trim() : "";

    // Build set of all codes from mass list (all variants)
    const massCodes = new Map<string, typeof massList[0]>();
    massList.forEach((m) => {
      const variants = getTFMVariants(m);
      variants.forEach((code) => massCodes.set(code, m));
    });

    // Build set of scanned codes
    const scannedCodes = new Set<string>();
    scannedComponents.forEach((c) => {
      scannedCodes.add(normalize(c.code));
      if (c.system) {
        scannedCodes.add(`${normalize(c.system)}-${normalize(c.code)}`);
        scannedCodes.add(`${normalize(c.system)}${normalize(c.code)}`);
      }
    });

    // Find matches
    const matches: Array<{
      component: ParsedComponent;
      massListItem: typeof massList[0];
    }> = [];
    const matchedCodes = new Set<string>();

    for (const comp of scannedComponents) {
      const code = normalize(comp.code);
      const systemCode = normalize(comp.system);

      // Try all variants
      const variants = [
        code,
        `${systemCode}-${code}`,
        `${systemCode}${code}`,
        `=${systemCode}-${code}`,
      ];

      for (const variant of variants) {
        const massItem = massCodes.get(variant);
        if (massItem) {
          matches.push({
            component: comp,
            massListItem: massItem,
          });
          matchedCodes.add(comp.code);
          break;
        }
      }
    }

    // Find unmatched components in document
    const unmatchedComponents = scannedComponents.filter(
      (c) => !matchedCodes.has(c.code)
    );

    // Find missing items from mass list (not found in document)
    const missingInDrawing = massList.filter((m) => {
      const variants = getTFMVariants(m);
      return !Array.from(variants).some((code) => scannedCodes.has(code));
    });

    return NextResponse.json({
      documentId,
      totalComponents: scannedComponents.length,
      matchedComponents: matches.length,
      totalInMassList: massList.length,
      missingInDrawing,
      unmatchedComponents,
      matches,
    });
  } catch (error) {
    console.error("Error verifying document:", error);
    return NextResponse.json(
      { error: "Kunne ikke verifisere dokument" },
      { status: 500 }
    );
  }
}
