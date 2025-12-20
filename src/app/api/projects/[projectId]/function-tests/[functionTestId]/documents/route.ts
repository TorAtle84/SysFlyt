import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import {
  deleteFile,
  saveFile,
  validateFileMimeType,
  validateFileName,
  validateFileSize,
} from "@/lib/file-utils";
import { randomUUID } from "crypto";

type UploadedFunctionTestDocument = {
  id: string;
  fileName: string;
  url: string;
  uploadedAt: string;
  uploadedById?: string;
};

async function requireProjectWriteAccess(
  projectId: string,
  userId: string,
  userRole: string
) {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") return true;
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  return membership?.role === "PROJECT_LEADER" || membership?.role === "USER";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractUploadedFileName(url: string): string | null {
  // saveFile() returns: /api/files/{projectId}/{fileName}
  const parts = url.split("/").filter(Boolean);
  const fileName = parts.at(-1);
  return fileName || null;
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
      select: { uploadedDocuments: true },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    return NextResponse.json({
      documents: asArray(functionTest.uploadedDocuments) as UploadedFunctionTestDocument[],
    });
  } catch (error) {
    console.error("Error fetching function test documents:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente dokumenter" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å laste opp dokumenter" },
        { status: 403 }
      );
    }

    const functionTest = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { id: true, uploadedDocuments: true },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Ingen fil mottatt" }, { status: 400 });
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

    const newDoc: UploadedFunctionTestDocument = {
      id: randomUUID(),
      fileName: file.name,
      url: saveResult.path,
      uploadedAt: new Date().toISOString(),
      uploadedById: authResult.user.id,
    };

    const docs = asArray(functionTest.uploadedDocuments) as UploadedFunctionTestDocument[];
    const updatedDocs = [newDoc, ...docs];

    await prisma.functionTest.update({
      where: { id: functionTestId },
      data: { uploadedDocuments: updatedDocs },
    });

    return NextResponse.json(
      { document: newDoc, documents: updatedDocs },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading function test document:", error);
    return NextResponse.json(
      { error: "Kunne ikke laste opp dokument" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å slette dokument" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json({ error: "Mangler documentId" }, { status: 400 });
    }

    const functionTest = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { uploadedDocuments: true },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    const docs = asArray(functionTest.uploadedDocuments) as UploadedFunctionTestDocument[];
    const toDelete = docs.find((d) => d.id === documentId);

    const updatedDocs = docs.filter((d) => d.id !== documentId);

    await prisma.functionTest.update({
      where: { id: functionTestId },
      data: { uploadedDocuments: updatedDocs },
    });

    if (toDelete?.url) {
      const fileName = extractUploadedFileName(toDelete.url);
      if (fileName) {
        await deleteFile(projectId, fileName).catch(() => null);
      }
    }

    return NextResponse.json({ success: true, documents: updatedDocs });
  } catch (error) {
    console.error("Error deleting function test document:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette dokument" },
      { status: 500 }
    );
  }
}
