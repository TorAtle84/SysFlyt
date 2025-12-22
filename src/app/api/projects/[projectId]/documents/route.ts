import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, canUploadDocuments } from "@/lib/auth-helpers";
import { validateFileName, validateFileSize, validateFileMimeType, saveFile } from "@/lib/file-utils";
import { extractSystemCodesFromPDF } from "@/lib/pdf-text-extractor";
import { scanDocumentForComponents, saveComponentsToDocument } from "@/lib/scan";

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
    const type = searchParams.get("type");
    const types = searchParams.get("types"); // Comma-separated list
    const latestOnly = searchParams.get("latest") !== "false";

    const whereClause: Record<string, unknown> = { projectId };

    if (types) {
      // Support comma-separated types (e.g., "FUNCTION_DESCRIPTION,DRAWING,SCHEMA")
      const typeList = types.split(",").map(t => t.trim()).filter(Boolean);
      if (typeList.length > 0) {
        whereClause.type = { in: typeList };
      }
    } else if (type) {
      whereClause.type = type;
    }

    if (latestOnly) {
      whereClause.isLatest = true;
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        tags: { include: { systemTag: true } },
        systemAnnotations: {
          select: { id: true, systemCode: true },
        },
        _count: {
          select: {
            annotations: true,
            components: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
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

    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: authResult.user.id },
    });

    if (!canUploadDocuments(authResult.user.role, membership?.role)) {
      return NextResponse.json(
        { error: "Ingen tilgang til å laste opp dokumenter" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const type = (formData.get("type") as string) || "OTHER";
    const autoTag = formData.get("autoTag") !== "false";

    if (!file) {
      return NextResponse.json({ error: "Fil er påkrevd" }, { status: 400 });
    }

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Tittel er påkrevd" }, { status: 400 });
    }

    const fileNameValidation = validateFileName(file.name);
    if (!fileNameValidation.valid) {
      return NextResponse.json({ error: fileNameValidation.error }, { status: 400 });
    }

    const fileSizeValidation = validateFileSize(file.size, fileNameValidation.type);
    if (!fileSizeValidation.valid) {
      return NextResponse.json({ error: fileSizeValidation.error }, { status: 400 });
    }

    const mimeValidation = validateFileMimeType(file.type, fileNameValidation.type);
    if (!mimeValidation.valid) {
      return NextResponse.json({ error: mimeValidation.error }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const existingDoc = await prisma.document.findFirst({
      where: {
        projectId,
        title: title.trim(),
        isLatest: true,
      },
      orderBy: { revision: "desc" },
    });

    let revision = 1;
    if (existingDoc) {
      revision = existingDoc.revision + 1;

      await prisma.document.update({
        where: { id: existingDoc.id },
        data: { isLatest: false },
      });
    }

    const saveResult = await saveFile(projectId, file.name, buffer);
    if (!saveResult.success) {
      return NextResponse.json({ error: saveResult.error }, { status: 500 });
    }

    let systemCodes: string[] = [];
    if (autoTag && file.name.toLowerCase().endsWith(".pdf")) {
      try {
        systemCodes = await extractSystemCodesFromPDF(buffer, file.name);
      } catch (err) {
        console.error("Error extracting system codes:", err);
      }
    }

    const primarySystem = systemCodes.length > 0 ? systemCodes[0] : null;

    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        fileName: file.name,
        fileUrl: saveResult.path,
        url: saveResult.path,
        projectId,
        type: type as "DRAWING" | "SCHEMA" | "MASSLIST" | "OTHER",
        revision,
        isLatest: true,
        uploadedById: authResult.user.id,
        systemTags: systemCodes,
        primarySystem,
      },
      include: {
        tags: { include: { systemTag: true } },
      },
    });

    if (systemCodes.length > 0) {
      for (let i = 0; i < systemCodes.length; i++) {
        const code = systemCodes[i];
        try {
          const systemTag = await prisma.systemTag.upsert({
            where: { code },
            update: {},
            create: { code },
          });

          await prisma.documentSystemTag.create({
            data: {
              documentId: document.id,
              systemTagId: systemTag.id,
              order: i,
            },
          });
        } catch (err) {
          console.error(`Error creating system tag ${code}:`, err);
        }
      }
    }

    // Auto-scan components if enabled
    if (autoTag && file.name.toLowerCase().endsWith(".pdf")) {
      try {
        console.log(`[Upload] Auto-scanning components for doc ${document.id}`);
        const scanResult = await scanDocumentForComponents(document.id, { enableGeometry: true });
        const savedCount = await saveComponentsToDocument(document.id, scanResult.components);
        console.log(`[Upload] Scanned and saved ${savedCount} components`);
      } catch (err) {
        console.error("Error auto-scanning components:", err);
      }
    }

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
