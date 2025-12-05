import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

interface MCItem {
  system: string;
  component: string;
  location?: string;
  documentId: string;
  documentTitle: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const massList = await prisma.massList.findMany({
      where: { projectId },
      orderBy: [{ system: "asc" }, { component: "asc" }],
    });

    const documents = await prisma.document.findMany({
      where: { 
        projectId, 
        type: "SCHEMA",
        isLatest: true,
      },
      select: {
        id: true,
        title: true,
        components: true,
      },
    });

    const mcItems: MCItem[] = [];

    for (const doc of documents) {
      for (const comp of doc.components) {
        const massListMatch = massList.find((m) => {
          const normalizedCode = comp.code.replace(/[.\-_]/g, "").toLowerCase();
          const tfmNorm = (m.tfm || "").replace(/[.\-_]/g, "").toLowerCase();
          const compNorm = (m.component || "").replace(/[.\-_]/g, "").toLowerCase();
          
          return (
            tfmNorm.includes(normalizedCode) ||
            normalizedCode.includes(tfmNorm) ||
            compNorm === normalizedCode ||
            (m.system && comp.system && m.system === comp.system)
          );
        });

        if (massListMatch) {
          mcItems.push({
            system: massListMatch.system || comp.system || "",
            component: comp.code,
            location: massListMatch.location || undefined,
            documentId: doc.id,
            documentTitle: doc.title,
          });
        }
      }
    }

    const grouped = mcItems.reduce((acc, item) => {
      const key = item.system || "Ukjent";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {} as Record<string, MCItem[]>);

    return NextResponse.json({
      items: mcItems,
      grouped,
      totalCount: mcItems.length,
      systemCount: Object.keys(grouped).length,
    });
  } catch (error) {
    console.error("Error fetching MC data:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente MC-data" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "items må være en array" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${items.length} elementer mottatt for MC-protokoll`,
    });
  } catch (error) {
    console.error("Error processing MC data:", error);
    return NextResponse.json(
      { error: "Kunne ikke behandle MC-data" },
      { status: 500 }
    );
  }
}
