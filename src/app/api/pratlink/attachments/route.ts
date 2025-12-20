import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectAccess } from "@/lib/auth-helpers";
import prisma from "@/lib/db";
import { saveFile } from "@/lib/file-utils";

const CHAT_ALLOWED_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".doc", ".docx"];
const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const messageId = formData.get("messageId") as string | null;
    const projectId = formData.get("projectId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Fil er påkrevd" },
        { status: 400 }
      );
    }

    if (!messageId || !projectId) {
      return NextResponse.json(
        { error: "Meldings-ID og prosjekt-ID er påkrevd" },
        { status: 400 }
      );
    }

    const accessCheck = await requireProjectAccess(projectId);
    if (!accessCheck.success) {
      return accessCheck.error;
    }

    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        authorId: authResult.user.id,
        room: {
          projectId,
        },
      },
    });

    if (!message) {
      return NextResponse.json(
        { error: "Melding ikke funnet eller du har ikke tilgang" },
        { status: 404 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !CHAT_ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
      return NextResponse.json(
        { error: "Filtypen er ikke tillatt" },
        { status: 400 }
      );
    }

    if (file.size > CHAT_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Filen er for stor. Maks størrelse er 10MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const saveResult = await saveFile(projectId, file.name, buffer);
    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error },
        { status: 500 }
      );
    }

    const attachment = await prisma.chatAttachment.create({
      data: {
        messageId,
        fileName: file.name,
        fileUrl: saveResult.path,
        fileType: file.type,
        fileSize: file.size,
      },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload attachment:", error);
    return NextResponse.json(
      { error: "Kunne ikke laste opp fil" },
      { status: 500 }
    );
  }
}
