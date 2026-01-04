import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { generateSecureFileName } from "@/lib/file-utils";
import { feedbackSupabase, FEEDBACK_BUCKET, getFeedbackContentType } from "@/lib/feedback-storage";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const feedbackSchema = z.object({
  category: z.enum(["BUG", "SUGGESTION", "UI", "PERFORMANCE", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  message: z.string().min(10).max(4000),
});

type FeedbackAttachment = {
  name: string;
  size: number;
  type: string;
  path: string;
  url: string;
};

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const formData = await request.formData();
    const category = String(formData.get("category") || "");
    const priority = String(formData.get("priority") || "MEDIUM");
    const message = String(formData.get("message") || "");

    const parsed = feedbackSchema.safeParse({ category, priority, message });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ugyldig tilbakemelding", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const files = formData
      .getAll("attachments")
      .filter((file): file is File => file instanceof File);

    if (files.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Maks ${MAX_ATTACHMENTS} vedlegg per tilbakemelding` },
        { status: 400 }
      );
    }

    for (const file of files) {
      const normalizedType = file.type || getFeedbackContentType(file.name);
      if (!ALLOWED_MIME_TYPES.has(normalizedType)) {
        return NextResponse.json(
          { error: "Kun bilder er tillatt (PNG, JPG, WEBP, GIF)" },
          { status: 400 }
        );
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        return NextResponse.json(
          { error: "Et eller flere bilder er for store (maks 5MB)" },
          { status: 400 }
        );
      }
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId: authResult.user.id,
        category: parsed.data.category,
        priority: parsed.data.priority,
        message: parsed.data.message,
      },
    });

    const attachments: FeedbackAttachment[] = [];
    const uploadedPaths: string[] = [];

    try {
      for (const file of files) {
        const secureName = generateSecureFileName(file.name);
        const storagePath = `${feedback.id}/${secureName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const contentType = file.type || getFeedbackContentType(file.name);

        const { error: uploadError } = await feedbackSupabase.storage
          .from(FEEDBACK_BUCKET)
          .upload(storagePath, buffer, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        uploadedPaths.push(storagePath);
        attachments.push({
          name: file.name,
          size: file.size,
          type: contentType,
          path: storagePath,
          url: `/api/feedback/files/${storagePath}`,
        });
      }

      const updated = await prisma.feedback.update({
        where: { id: feedback.id },
        data: { attachments },
      });

      return NextResponse.json({ feedback: updated });
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await feedbackSupabase.storage.from(FEEDBACK_BUCKET).remove(uploadedPaths);
      }
      await prisma.feedback.delete({ where: { id: feedback.id } });
      throw error;
    }
  } catch (error) {
    console.error("Error creating feedback:", error);
    return NextResponse.json(
      { error: "Kunne ikke sende tilbakemelding" },
      { status: 500 }
    );
  }
}
