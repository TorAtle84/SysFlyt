import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

const STATUS_VALUES = ["IN_PROGRESS", "DEVIATION", "CANCELED", "REMEDIATED", "COMPLETED"] as const;
const CATEGORY_VALUES = ["INSTALLATION", "DOCUMENTATION", "EQUIPMENT", "SAFETY", "OTHER"] as const;
const SEVERITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type StatusValue = (typeof STATUS_VALUES)[number];
type CategoryValue = (typeof CATEGORY_VALUES)[number];
type SeverityValue = (typeof SEVERITY_VALUES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStatus(value: unknown): value is StatusValue {
  return typeof value === "string" && STATUS_VALUES.includes(value as StatusValue);
}

function isCategory(value: unknown): value is CategoryValue {
  return typeof value === "string" && CATEGORY_VALUES.includes(value as CategoryValue);
}

function isSeverity(value: unknown): value is SeverityValue {
  return typeof value === "string" && SEVERITY_VALUES.includes(value as SeverityValue);
}

async function resolveProjectLeaderAccess(projectId: string, userId: string, userRole: string) {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") return true;
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  return membership?.role === "PROJECT_LEADER";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const ncr = await prisma.nCR.findFirst({
      where: { id: ncrId, projectId },
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        linkedItem: {
          include: {
            massList: true,
          },
        },
        photos: { orderBy: { createdAt: "desc" } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!ncr) {
      return NextResponse.json({ error: "Avvik ikke funnet" }, { status: 404 });
    }

    return NextResponse.json({ ncr });
  } catch (error) {
    console.error("Error fetching NCR:", error);
    return NextResponse.json({ error: "Kunne ikke hente avvik" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request" }, { status: 400 });
    }

    const existing = await prisma.nCR.findFirst({
      where: { id: ncrId, projectId },
      select: {
        status: true,
        corrective: true,
        linkedItemId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Avvik ikke funnet" }, { status: 404 });
    }

    const statusValue = isStatus(body.status) ? body.status : existing.status;
    const statusProvided = body.status !== undefined;
    const categoryValue = body.category;
    const severityValue = body.severity;

    if (typeof body.title === "string" && !body.title.trim()) {
      return NextResponse.json({ error: "Tittel er p\u00e5krevd" }, { status: 400 });
    }

    if (categoryValue !== undefined && !isCategory(categoryValue)) {
      return NextResponse.json({ error: "Ugyldig kategori" }, { status: 400 });
    }
    if (severityValue !== undefined && !isSeverity(severityValue)) {
      return NextResponse.json({ error: "Ugyldig alvorlighet" }, { status: 400 });
    }

    const nextCorrective =
      typeof body.corrective === "string" ? body.corrective.trim() : existing.corrective;

    if (statusValue === "COMPLETED") {
      const canSetCompleted = await resolveProjectLeaderAccess(
        projectId,
        authResult.user.id,
        authResult.user.role
      );

      if (!canSetCompleted) {
        return NextResponse.json(
          { error: "Kun prosjektleder kan sette avvik til fullf\u00f8rt" },
          { status: 403 }
        );
      }

      if (!nextCorrective) {
        return NextResponse.json(
          { error: "Korrigerende tiltak er p\u00e5krevd f\u00f8r avslutning" },
          { status: 400 }
        );
      }
    }

    const assignedTo =
      typeof body.assignedTo === "string" && body.assignedTo.trim()
        ? body.assignedTo.trim()
        : body.assignedTo === null
          ? null
          : undefined;

    const linkedItemId =
      typeof body.linkedItemId === "string" && body.linkedItemId.trim()
        ? body.linkedItemId.trim()
        : body.linkedItemId === null
          ? null
          : undefined;

    if (linkedItemId && linkedItemId !== existing.linkedItemId) {
      const linkedItem = await prisma.mCProtocolItem.findFirst({
        where: { id: linkedItemId, protocol: { projectId } },
        select: { id: true },
      });
      if (!linkedItem) {
        return NextResponse.json({ error: "MC-linje ikke funnet" }, { status: 404 });
      }
    }

    const updateData = {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      description: typeof body.description === "string" ? body.description.trim() : undefined,
      category: isCategory(categoryValue) ? categoryValue : undefined,
      severity: isSeverity(severityValue) ? severityValue : undefined,
      status: statusProvided ? statusValue : undefined,
      assignedTo,
      linkedItemId,
      rootCause: typeof body.rootCause === "string" ? body.rootCause.trim() : undefined,
      corrective: typeof body.corrective === "string" ? body.corrective.trim() : undefined,
      closedAt: statusProvided
        ? statusValue === "COMPLETED"
          ? new Date()
          : null
        : undefined,
    };

    const ncr = await prisma.nCR.update({
      where: { id: ncrId },
      data: updateData,
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        linkedItem: {
          include: {
            massList: true,
          },
        },
        photos: { orderBy: { createdAt: "desc" } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    return NextResponse.json({ ncr });
  } catch (error) {
    console.error("Error updating NCR:", error);
    return NextResponse.json({ error: "Kunne ikke oppdatere avvik" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canDelete = await resolveProjectLeaderAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canDelete) {
      return NextResponse.json(
        { error: "Kun prosjektleder kan slette avvik" },
        { status: 403 }
      );
    }

    const existing = await prisma.nCR.findFirst({
      where: { id: ncrId, projectId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Avvik ikke funnet" }, { status: 404 });
    }

    await prisma.nCR.delete({ where: { id: ncrId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting NCR:", error);
    return NextResponse.json({ error: "Kunne ikke slette avvik" }, { status: 500 });
  }
}
