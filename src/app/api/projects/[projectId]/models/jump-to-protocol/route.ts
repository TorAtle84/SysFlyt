import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

function parseFullTag(fullTagRaw: string): { systemCode: string; componentTag: string; baseSystemCode: string } | null {
  const fullTag = fullTagRaw.trim();
  if (!fullTag) return null;

  const [systemPart, ...rest] = fullTag.split("-");
  const componentPart = rest.join("-").trim();

  const systemCode = (systemPart || "").trim();
  if (!systemCode || !componentPart) return null;

  const baseSystemCode = systemCode.includes(":") ? systemCode.split(":")[0] : systemCode;
  return { systemCode, componentTag: componentPart, baseSystemCode };
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

    const { searchParams } = new URL(request.url);
    const fullTagRaw = searchParams.get("fullTag");
    if (!fullTagRaw) {
      return NextResponse.json({ error: "fullTag er påkrevd" }, { status: 400 });
    }

    const parsed = parseFullTag(fullTagRaw);
    if (!parsed) {
      return NextResponse.json({ error: "Ugyldig fullTag" }, { status: 400 });
    }

    const { systemCode, componentTag, baseSystemCode } = parsed;

    const protocol =
      (await prisma.mCProtocol.findFirst({
        where: { projectId, systemCode: baseSystemCode },
        select: { id: true },
      })) ||
      (baseSystemCode !== systemCode
        ? await prisma.mCProtocol.findFirst({
            where: { projectId, systemCode },
            select: { id: true },
          })
        : null);

    if (!protocol) {
      return NextResponse.json({ error: "Protokoll ikke funnet" }, { status: 404 });
    }

    const item = await prisma.mCProtocolItem.findFirst({
      where: {
        protocolId: protocol.id,
        massList: {
          projectId,
          system: { in: baseSystemCode !== systemCode ? [systemCode, baseSystemCode] : [systemCode] },
          component: { equals: componentTag, mode: "insensitive" },
        },
      },
      select: { id: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Punkt ikke funnet i protokollen" }, { status: 404 });
    }

    return NextResponse.json({ protocolId: protocol.id, itemId: item.id });
  } catch (error) {
    console.error("Error resolving jump-to-protocol:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

