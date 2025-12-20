import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, canUploadDocuments } from "@/lib/auth-helpers";
import { validateModelFileName, validateModelFileSize, saveModelOriginalFile } from "@/lib/bim/bim-file-utils";
import { ModelStatus } from "@prisma/client";
import { convertBimModelInBackground } from "@/lib/bim/model-conversion";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const models = await prisma.bimModel.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { components: true } },
      },
    });

    return NextResponse.json(models);
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
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
        { error: "Ingen tilgang til å laste opp modeller" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name");

    if (!file) {
      return NextResponse.json({ error: "Fil er påkrevd" }, { status: 400 });
    }

    const fileNameValidation = validateModelFileName(file.name);
    if (!fileNameValidation.valid) {
      return NextResponse.json({ error: fileNameValidation.error }, { status: 400 });
    }

    const fileSizeValidation = validateModelFileSize(file.size);
    if (!fileSizeValidation.valid) {
      return NextResponse.json({ error: fileSizeValidation.error }, { status: 400 });
    }

    const displayName =
      typeof name === "string" && name.trim().length > 0
        ? name.trim()
        : file.name.replace(/\.[^.]+$/, "");

    const model = await prisma.bimModel.create({
      data: {
        projectId,
        name: displayName,
        fileName: file.name,
        fileSize: file.size,
        format: fileNameValidation.format,
        originalPath: "",
        status: ModelStatus.UPLOADING,
        uploadedById: authResult.user.id,
      },
    });

    const saveResult = await saveModelOriginalFile({
      projectId,
      modelId: model.id,
      ext: fileNameValidation.ext,
      file,
    });

    if (!saveResult.success) {
      await prisma.bimModel.update({
        where: { id: model.id },
        data: { status: ModelStatus.ERROR, errorMessage: saveResult.error },
      });
      return NextResponse.json({ error: saveResult.error }, { status: 500 });
    }

    const updatedModel = await prisma.bimModel.update({
      where: { id: model.id },
      data: {
        originalPath: saveResult.apiPath,
        status: ModelStatus.CONVERTING,
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { components: true } },
      },
    });

    convertBimModelInBackground({ projectId, modelId: model.id });

    return NextResponse.json(updatedModel, { status: 201 });
  } catch (error) {
    console.error("Error uploading model:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

