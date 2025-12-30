import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { saveFile, deleteFile as deleteStorageFile, generateSecureFileName } from "@/lib/file-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const photos = await prisma.nCRPhoto.findMany({
      where: { ncrId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ photos });
  } catch (error) {
    console.error("Error fetching NCR photos:", error);
    return NextResponse.json({ error: "Kunne ikke hente bilder" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; ncrId: string }> }
) {
  try {
    const { projectId, ncrId } = await params;
    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const caption = formData.get("caption") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Ingen fil mottatt" }, { status: 400 });
    }

    const secureFileName = generateSecureFileName(file.name);
    const fileName = `ncr-photos/${ncrId}_${secureFileName}`;

    const bytes = await file.arrayBuffer();
    const result = await saveFile(projectId, fileName, Buffer.from(bytes));

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Kunne ikke laste opp bilde" },
        { status: 500 }
      );
    }

    const photo = await prisma.nCRPhoto.create({
      data: {
        ncrId,
        fileUrl: result.path,
        caption: caption || undefined,
      },
    });

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error("Error uploading NCR photo:", error);
    return NextResponse.json({ error: "Kunne ikke laste opp bilde" }, { status: 500 });
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

    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get("photoId");

    if (!photoId) {
      return NextResponse.json({ error: "Mangler photoId" }, { status: 400 });
    }

    const photo = await prisma.nCRPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.ncrId !== ncrId) {
      return NextResponse.json({ error: "Bilde ikke funnet" }, { status: 404 });
    }

    if (photo.fileUrl) {
      await deleteStorageFile(projectId, photo.fileUrl);
    }

    await prisma.nCRPhoto.delete({ where: { id: photoId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting NCR photo:", error);
    return NextResponse.json({ error: "Kunne ikke slette bilde" }, { status: 500 });
  }
}
