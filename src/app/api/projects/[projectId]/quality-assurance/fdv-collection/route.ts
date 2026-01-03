import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { buildFdvSummary, type FdvComponentCoverage } from "@/lib/fdv-collection";

type FdvComponentResponse = {
  id: string;
  tfm: string | null;
  systemCode: string | null;
  systemName: string | null;
  name: string;
  productName: string | null;
  supplierName: string | null;
  datasheetCount: number;
  installationCount: number;
  fileCount: number;
  hasFdv: boolean;
};

function resolveComponentId(item: {
  id: string;
  massList?: { id: string; tfm: string | null };
}): string {
  return item.massList?.tfm || item.massList?.id || item.id;
}

function resolveComponentName(item: {
  massList?: { component: string | null; description: string | null; productName: string | null };
}): string {
  return (
    item.massList?.component ||
    item.massList?.description ||
    item.massList?.productName ||
    "Ukjent komponent"
  );
}

function resolveSystemCode(item: {
  massList?: { system: string | null };
  protocol?: { systemCode: string };
}): string | null {
  return item.massList?.system || item.protocol?.systemCode || null;
}

function resolveSystemName(item: { protocol?: { systemName: string | null } }): string | null {
  return item.protocol?.systemName || null;
}

function countDocTypes(datasheets: Array<{ type: string | null }>) {
  const datasheetCount = datasheets.filter((ds) => !ds.type || ds.type === "DATASHEET").length;
  const installationCount = datasheets.filter((ds) => ds.type === "INSTALLATION").length;
  return { datasheetCount, installationCount };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const items = await prisma.mCProtocolItem.findMany({
      where: { protocol: { projectId } },
      include: {
        massList: {
          select: {
            id: true,
            tfm: true,
            system: true,
            component: true,
            description: true,
            productName: true,
            supplierName: true,
          },
        },
        protocol: {
          select: { systemCode: true, systemName: true },
        },
        product: {
          select: {
            name: true,
            supplier: { select: { name: true } },
            datasheets: { select: { id: true, type: true, fileHash: true, fileUrl: true } },
          },
        },
      },
      orderBy: {
        massList: { tfm: "asc" },
      },
    });

    // START FIX: Also fetch documents linked via DocumentComponent (TFM tagging)
    const tfmList = items
      .map((i) => i.massList?.tfm)
      .filter((tfm): tfm is string => !!tfm);

    const taggedDocs = await prisma.documentComponent.findMany({
      where: {
        document: { projectId },
        code: { in: tfmList },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileUrl: true,
            type: true,
          },
        },
      },
    });

    const taggedDocsMap = new Map<string, typeof taggedDocs>();
    taggedDocs.forEach((dc) => {
      const list = taggedDocsMap.get(dc.code) || [];
      list.push(dc);
      taggedDocsMap.set(dc.code, list);
    });
    // END FIX

    const uniqueFileKeys = new Set<string>();
    const components: FdvComponentResponse[] = items.map((item) => {
      const productDatasheets = item.product?.datasheets || [];

      // Get tagged documents for this component's TFM
      const tfm = item.massList?.tfm;
      const componentDocs = tfm ? taggedDocsMap.get(tfm) || [] : [];

      // Combine counts
      const { datasheetCount, installationCount } = countDocTypes(productDatasheets);

      // Count generic documents (we assume OTHER/DATASHEET maps to datasheet count for now)
      // or just treat them as generic files.
      // Since DocumentType doesn't strictly match "DATASHEET"/"INSTALLATION" strings from ProductDatasheet, 
      // we'll add them to fileCount and ensure hasFdv is true.

      const fileCount = productDatasheets.length + componentDocs.length;
      const hasFdv = fileCount > 0;

      productDatasheets.forEach((ds) => {
        uniqueFileKeys.add(ds.fileHash || ds.fileUrl || ds.id);
      });
      componentDocs.forEach((cd) => {
        uniqueFileKeys.add(cd.document.id);
      });

      return {
        id: resolveComponentId(item),
        tfm: item.massList?.tfm || null,
        systemCode: resolveSystemCode(item),
        systemName: resolveSystemName(item),
        name: resolveComponentName(item),
        productName: item.product?.name || item.massList?.productName || null,
        supplierName: item.product?.supplier?.name || item.massList?.supplierName || null,
        datasheetCount: datasheetCount + componentDocs.length, // Add tagged docs to count
        installationCount,
        fileCount,
        hasFdv,
      };
    });

    const coverageComponents: FdvComponentCoverage[] = components.map((component) => ({
      id: component.id,
      systemCode: component.systemCode,
      name: component.name,
      hasFdv: component.hasFdv,
    }));

    const { summary, missingComponents } = buildFdvSummary(
      coverageComponents,
      uniqueFileKeys.size
    );

    return NextResponse.json({
      summary,
      components,
      missingComponents,
    });
  } catch (error) {
    console.error("FDV collection error:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente FDV-samling" },
      { status: 500 }
    );
  }
}
