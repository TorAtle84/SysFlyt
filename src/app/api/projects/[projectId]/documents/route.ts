import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, canUploadDocuments } from "@/lib/auth-helpers";
import { validateFileName, validateFileSize, validateFileMimeType, saveFile } from "@/lib/file-utils";

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

    const documents = await prisma.document.findMany({
      where: { projectId },
      include: {
        tags: { include: { systemTag: true } },
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

    const saveResult = await saveFile(projectId, file.name, buffer);
    if (!saveResult.success) {
      return NextResponse.json({ error: saveResult.error }, { status: 500 });
    }

    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        fileName: file.name,
        fileUrl: saveResult.path,
        url: saveResult.path,
        projectId,
        uploadedById: authResult.user.id,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
