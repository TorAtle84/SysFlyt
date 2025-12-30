import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const severity = searchParams.get("severity");
    const search = searchParams.get("search")?.trim();
    const pageValue = Number(searchParams.get("page") ?? 1);
    const pageSizeValue = Number(searchParams.get("pageSize") ?? 20);
    const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
    const pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0
      ? Math.min(50, pageSizeValue)
      : 20;

    const where: Prisma.NCRWhereInput = { projectId };

    if (isStatus(status)) {
      where.status = status;
    }
    if (isCategory(category)) {
      where.category = category;
    }
    if (isSeverity(severity)) {
      where.severity = severity;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { reporter: { is: { firstName: { contains: search, mode: "insensitive" } } } },
        { reporter: { is: { lastName: { contains: search, mode: "insensitive" } } } },
        { assignee: { is: { firstName: { contains: search, mode: "insensitive" } } } },
        { assignee: { is: { lastName: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.nCR.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reporter: { select: { id: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          linkedItem: {
            select: {
              id: true,
              massList: { select: { tfm: true, system: true, component: true } },
            },
          },
          _count: { select: { comments: true, photos: true } },
        },
      }),
      prisma.nCR.count({ where }),
    ]);

    const canSetCompleted = await resolveProjectLeaderAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      canSetCompleted,
    });
  } catch (error) {
    console.error("Error fetching NCRs:", error);
    return NextResponse.json({ error: "Kunne ikke hente avvik" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request" }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const category = body.category;
    const severity = body.severity;
    const status = body.status;
    const assignedTo = typeof body.assignedTo === "string" && body.assignedTo.trim()
      ? body.assignedTo.trim()
      : null;
    const linkedItemId = typeof body.linkedItemId === "string" && body.linkedItemId.trim()
      ? body.linkedItemId.trim()
      : null;
    const rootCause = String(body.rootCause ?? "").trim() || null;
    const corrective = String(body.corrective ?? "").trim() || null;

    if (!title) {
      return NextResponse.json({ error: "Tittel er p\u00e5krevd" }, { status: 400 });
    }
    if (!isCategory(category)) {
      return NextResponse.json({ error: "Ugyldig kategori" }, { status: 400 });
    }
    if (!isSeverity(severity)) {
      return NextResponse.json({ error: "Ugyldig alvorlighet" }, { status: 400 });
    }

    const statusValue: StatusValue = isStatus(status) ? status : "DEVIATION";
    const canSetCompleted = await resolveProjectLeaderAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (statusValue === "COMPLETED" && !canSetCompleted) {
      return NextResponse.json(
        { error: "Kun prosjektleder kan sette avvik til fullf\u00f8rt" },
        { status: 403 }
      );
    }

    if (statusValue === "COMPLETED" && !corrective) {
      return NextResponse.json(
        { error: "Korrigerende tiltak er p\u00e5krevd f\u00f8r avslutning" },
        { status: 400 }
      );
    }

    if (linkedItemId) {
      const linkedItem = await prisma.mCProtocolItem.findFirst({
        where: { id: linkedItemId, protocol: { projectId } },
        select: { id: true },
      });
      if (!linkedItem) {
        return NextResponse.json({ error: "MC-linje ikke funnet" }, { status: 404 });
      }
    }

    const ncr = await prisma.nCR.create({
      data: {
        projectId,
        title,
        description,
        category,
        severity,
        status: statusValue,
        reportedBy: authResult.user.id,
        assignedTo,
        linkedItemId,
        rootCause,
        corrective,
        closedAt: statusValue === "COMPLETED" ? new Date() : null,
      },
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        linkedItem: {
          select: {
            id: true,
            massList: { select: { tfm: true, system: true, component: true } },
          },
        },
        _count: { select: { comments: true, photos: true } },
      },
    });

    return NextResponse.json({ ncr }, { status: 201 });
  } catch (error) {
    console.error("Error creating NCR:", error);
    return NextResponse.json({ error: "Kunne ikke opprette avvik" }, { status: 500 });
  }
}
