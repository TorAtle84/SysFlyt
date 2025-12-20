import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { extractPlainTextFromPDF, parseSystemTagsFromText } from "@/lib/pdf-text-extractor";
import { normalizeSystemCode } from "@/lib/tfm-id";
import path from "path";
import { readFile, stat } from "fs/promises";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const DISCIPLINE_LABELS: Record<string, string> = {
  VENTILASJON: "Ventilasjon",
  BYGGAUTOMASJON: "Byggautomasjon",
  ELEKTRO: "Elektro",
  KULDE: "Kulde",
  RORLEGGER: "Rørlegger",
  BYGGHERRE: "Byggherre",
  TOTALENTREPRENOR: "Totalentreprenør",
  SPRINKLER: "Sprinkler",
  ANNET: "Annet",
};

function disciplineToLabel(value?: string | null): string {
  if (!value) return "";
  const key = value.toUpperCase();
  return DISCIPLINE_LABELS[key] || value;
}

function resolveUploadsPath(projectId: string, fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  const prefix = `/api/files/${projectId}/`;
  if (!fileUrl.startsWith(prefix)) return null;

  const rel = fileUrl.slice(prefix.length);
  if (!rel || rel.includes("..") || rel.includes("~")) return null;

  const filePath = path.join(UPLOADS_DIR, projectId, rel);
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(UPLOADS_DIR)) return null;

  return normalizedPath;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string }>;
  }
) {
  try {
    const { projectId, functionTestId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const functionTest = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { id: true, systemCode: true },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    const primarySystemCode = normalizeSystemCode(functionTest.systemCode);

    const schemaDocument = await prisma.document.findFirst({
      where: {
        projectId,
        type: "SCHEMA",
        isLatest: true,
        OR: [
          { primarySystem: primarySystemCode },
          { systemTags: { has: primarySystemCode } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        url: true,
        primarySystem: true,
        systemTags: true,
        tags: {
          select: {
            role: true,
            systemTag: {
              select: { code: true },
            },
          },
        },
      },
    });

    // Also look for function description documents
    const functionDescDocument = await prisma.document.findFirst({
      where: {
        projectId,
        type: "FUNCTION_DESCRIPTION",
        isLatest: true,
        OR: [
          { primarySystem: primarySystemCode },
          { systemTags: { has: primarySystemCode } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        url: true,
        primarySystem: true,
        systemTags: true,
        tags: {
          select: {
            role: true,
            systemTag: {
              select: { code: true },
            },
          },
        },
      },
    });

    if (!schemaDocument && !functionDescDocument) {
      return NextResponse.json({
        schemaDocument: null,
        functionDescDocument: null,
        referencedSystems: [],
        suggestions: [],
        message: `Fant ikke systemskjema eller funksjonsbeskrivelse for ${primarySystemCode}`,
      });
    }

    const referencedSystems = new Set<string>();

    // 1) SystemAnnotations from schema (most precise if boxed by user)
    if (schemaDocument) {
      const annotations = await prisma.systemAnnotation.findMany({
        where: {
          documentId: schemaDocument.id,
          type: "SYSTEM",
          systemCode: { not: null },
        },
        select: { systemCode: true },
      });

      for (const a of annotations) {
        const code = normalizeSystemCode(a.systemCode);
        if (code) referencedSystems.add(code);
      }

      for (const a of annotations) {
        const code = normalizeSystemCode(a.systemCode);
        if (code) referencedSystems.add(code);
      }

      // 1.5) DocumentSystemTags (explicitly marked as DELANSVARLIG)
      if (schemaDocument.tags) {
        for (const t of schemaDocument.tags) {
          if (t.role === "DELANSVARLIG" && t.systemTag.code) {
            referencedSystems.add(t.systemTag.code);
          }
        }
      }
      const resolvedPath = resolveUploadsPath(
        projectId,
        schemaDocument.fileUrl || schemaDocument.url
      );

      if (resolvedPath && resolvedPath.toLowerCase().endsWith(".pdf")) {
        try {
          await stat(resolvedPath);
          const buffer = await readFile(resolvedPath);
          const text = await extractPlainTextFromPDF(buffer);
          const tags = parseSystemTagsFromText(text);
          for (const t of tags) {
            const code = normalizeSystemCode(t);
            if (code) referencedSystems.add(code);
          }
        } catch (e) {
          console.warn("[FunctionTests] Could not parse schema PDF for systems:", e);
        }
      }
    }

    // 2) DocumentSystemTags from function description
    if (functionDescDocument) {
      if (functionDescDocument.tags) {
        for (const t of functionDescDocument.tags) {
          if (t.role === "DELANSVARLIG" && t.systemTag.code) {
            referencedSystems.add(t.systemTag.code);
          }
        }
      }

      // Fallback: SystemAnnotations from function description if no tags?
      // Or combine both.
      const fdAnnotations = await prisma.systemAnnotation.findMany({
        where: {
          documentId: functionDescDocument.id,
          type: "SYSTEM",
          systemCode: { not: null },
        },
        select: { systemCode: true },
      });

      for (const a of fdAnnotations) {
        const code = normalizeSystemCode(a.systemCode);
        if (code) referencedSystems.add(code);
      }

      // Also check systemTags stored on the document
      if (functionDescDocument.systemTags) {
        for (const tag of functionDescDocument.systemTags) {
          const code = normalizeSystemCode(tag);
          if (code && code !== primarySystemCode) referencedSystems.add(code);
        }
      }

      // PDF text parsing fallback for function description  
      const fdResolvedPath = resolveUploadsPath(
        projectId,
        functionDescDocument.fileUrl || functionDescDocument.url
      );

      if (fdResolvedPath && fdResolvedPath.toLowerCase().endsWith(".pdf")) {
        try {
          await stat(fdResolvedPath);
          const buffer = await readFile(fdResolvedPath);
          const text = await extractPlainTextFromPDF(buffer);
          const tags = parseSystemTagsFromText(text);
          for (const t of tags) {
            const code = normalizeSystemCode(t);
            if (code) referencedSystems.add(code);
          }
        } catch (e) {
          console.warn("[FunctionTests] Could not parse function description PDF for systems:", e);
        }
      }
    }

    // Remove primary system itself
    referencedSystems.delete(primarySystemCode);

    const systems = Array.from(referencedSystems).sort((a, b) => a.localeCompare(b));

    if (systems.length === 0) {
      return NextResponse.json({
        schemaDocument: schemaDocument ? { id: schemaDocument.id, title: schemaDocument.title } : null,
        functionDescDocument: functionDescDocument ? { id: functionDescDocument.id, title: functionDescDocument.title } : null,
        referencedSystems: [],
        suggestions: [],
        message: "Fant ingen refererte systemer i dokumentene",
      });
    }

    const protocols = await prisma.mCProtocol.findMany({
      where: { projectId, systemCode: { in: systems } },
      select: {
        systemCode: true,
        systemOwnerId: true, // discipline (string)
        assignedUserId: true, // person (User ID)
      },
    });

    const protocolBySystem = new Map(protocols.map((p) => [p.systemCode, p]));

    const ownerUserIds = Array.from(
      new Set(protocols.map((p) => p.assignedUserId).filter((v): v is string => !!v))
    );

    const owners = ownerUserIds.length > 0
      ? await prisma.user.findMany({
        where: { id: { in: ownerUserIds } },
        select: { id: true, firstName: true, lastName: true },
      })
      : [];

    const ownerById = new Map(
      owners.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])
    );

    const suggestions = systems.map((systemCode) => {
      const protocol = protocolBySystem.get(systemCode);
      const discipline = disciplineToLabel(protocol?.systemOwnerId || null);
      const systemOwnerUserId = protocol?.assignedUserId || null;
      const systemOwnerName = systemOwnerUserId ? ownerById.get(systemOwnerUserId) || null : null;

      return {
        systemCode,
        discipline,
        systemOwnerUserId,
        systemOwnerName,
        hasProtocol: !!protocol,
      };
    });

    return NextResponse.json({
      schemaDocument: schemaDocument ? { id: schemaDocument.id, title: schemaDocument.title } : null,
      functionDescDocument: functionDescDocument ? { id: functionDescDocument.id, title: functionDescDocument.title } : null,
      referencedSystems: systems,
      suggestions,
    });
  } catch (error) {
    console.error("Error auto-detecting function test responsibles:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente delansvarlige automatisk" },
      { status: 500 }
    );
  }
}

