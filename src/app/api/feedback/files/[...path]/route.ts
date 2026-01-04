import { NextRequest, NextResponse } from "next/server";
import path from "path";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { feedbackSupabase, FEEDBACK_BUCKET, getFeedbackContentType } from "@/lib/feedback-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;

    if (!pathSegments || pathSegments.length < 2) {
      return NextResponse.json({ error: "Ugyldig filsti" }, { status: 400 });
    }

    const feedbackId = pathSegments[0];
    const fileName = pathSegments.slice(1).join("/");

    if (fileName.includes("..") || fileName.includes("~")) {
      return NextResponse.json({ error: "Ugyldig filsti" }, { status: 400 });
    }

    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { userId: true, attachments: true },
    });

    if (!feedback) {
      return NextResponse.json({ error: "Tilbakemelding ikke funnet" }, { status: 404 });
    }

    if (authResult.user.role !== "ADMIN" && feedback.userId !== authResult.user.id) {
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    const storagePath = `${feedbackId}/${fileName}`;
    const attachments = Array.isArray(feedback.attachments) ? feedback.attachments : [];
    const hasMatch = attachments.some((attachment: any) => attachment?.path === storagePath);

    if (!hasMatch) {
      return NextResponse.json({ error: "Fil ikke funnet" }, { status: 404 });
    }

    const { data: fileBlob, error } = await feedbackSupabase.storage
      .from(FEEDBACK_BUCKET)
      .download(storagePath);

    if (error || !fileBlob) {
      return NextResponse.json({ error: "Fil ikke funnet" }, { status: 404 });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const contentType = getFeedbackContentType(fileName);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(fileName))}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error serving feedback file:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente fil" },
      { status: 500 }
    );
  }
}
