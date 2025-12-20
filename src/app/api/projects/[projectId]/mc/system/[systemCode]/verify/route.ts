import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { getTFMVariants, normalizeSystemCode, normalizeComponentCode } from "@/lib/tfm-id";

/**
 * POST /api/projects/[projectId]/mc/system/[systemCode]/verify
 * Verify components in a specific system's MC checklist against mass list
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; systemCode: string }> }
) {
  try {
    const { projectId, systemCode } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    // Decode system code (URL encoded)
    const decodedSystemCode = decodeURIComponent(systemCode);

    // Fetch all mass list entries for this system
    const massList = await prisma.massList.findMany({
      where: {
        projectId,
        system: decodedSystemCode,
      },
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

    if (massList.length === 0) {
      return NextResponse.json({
        systemCode: decodedSystemCode,
        totalInMassList: 0,
        totalInDocuments: 0,
        verified: [],
        missingInDocuments: [],
        message: "Ingen oppføringer funnet i masselisten for dette systemet",
      });
    }

    // Fetch all document components for this system
    const documentComponents = await prisma.documentComponent.findMany({
      where: {
        system: decodedSystemCode,
        document: {
          projectId,
          type: "SCHEMA",
          isLatest: true,
        },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Build map of document component codes
    const docComponentMap = new Map<string, typeof documentComponents[0]>();
    documentComponents.forEach((comp) => {
      const normalizedCode = normalizeComponentCode(comp.code);
      docComponentMap.set(normalizedCode, comp);
      // Also store with system prefix
      docComponentMap.set(`${normalizeSystemCode(comp.system)}-${normalizedCode}`, comp);
      docComponentMap.set(`${normalizeSystemCode(comp.system)}${normalizedCode}`, comp);
    });

    // Verify each mass list item
    const verified: Array<{
      massListItem: typeof massList[0];
      documentComponent: {
        code: string;
        documentId: string;
        documentTitle: string;
        page: number;
        x: number;
        y: number;
      };
    }> = [];
    const missingInDocuments: typeof massList = [];

    for (const massItem of massList) {
      // Generate all possible variants of this TFM code
      const variants = getTFMVariants(massItem);

      let found = false;
      for (const variant of variants) {
        const normalizedVariant = variant
          .replace(/[+=%\-]/g, "")
          .toUpperCase()
          .trim();

        const docComp = docComponentMap.get(normalizedVariant);
        if (docComp) {
          verified.push({
            massListItem: massItem,
            documentComponent: {
              code: docComp.code,
              documentId: docComp.document.id,
              documentTitle: docComp.document.title,
              page: docComp.page || 1,
              x: docComp.x || 0,
              y: docComp.y || 0,
            },
          });
          found = true;
          break;
        }
      }

      if (!found) {
        missingInDocuments.push(massItem);
      }
    }

    return NextResponse.json({
      systemCode: decodedSystemCode,
      totalInMassList: massList.length,
      totalInDocuments: documentComponents.length,
      verifiedCount: verified.length,
      missingCount: missingInDocuments.length,
      verified,
      missingInDocuments,
      verificationRate: massList.length > 0
        ? Math.round((verified.length / massList.length) * 100)
        : 0,
    });
  } catch (error) {
    console.error("Error verifying MC system:", error);
    return NextResponse.json(
      { error: "Kunne ikke verifisere MC-system" },
      { status: 500 }
    );
  }
}
