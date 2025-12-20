import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function GET(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
            itemId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId, itemId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const photos = await prisma.mCItemPhoto.findMany({
            where: { itemId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ photos });
    } catch (error) {
        console.error("Error fetching item photos:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente bilder" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
            itemId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId, itemId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const caption = formData.get("caption") as string | null;

        if (!file) {
            return NextResponse.json(
                { error: "Ingen fil mottatt" },
                { status: 400 }
            );
        }

        // Generate unique filename
        const ext = path.extname(file.name);
        const timestamp = Date.now();
        const fileName = `${timestamp}_${itemId}${ext}`;

        // Save to files directory
        const uploadDir = path.join(process.cwd(), "public", "files", projectId, "mc-photos");
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, fileName);
        const bytes = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(bytes));

        // Create database entry
        const fileUrl = `/files/${projectId}/mc-photos/${fileName}`;
        const photo = await prisma.mCItemPhoto.create({
            data: {
                itemId,
                fileUrl,
                caption: caption || undefined,
            },
        });

        return NextResponse.json({ photo });
    } catch (error) {
        console.error("Error uploading item photo:", error);
        return NextResponse.json(
            { error: "Kunne ikke laste opp bilde" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{
            projectId: string;
            protocolId: string;
            itemId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId, itemId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const { searchParams } = new URL(request.url);
        const photoId = searchParams.get("photoId");

        if (!photoId) {
            return NextResponse.json(
                { error: "Mangler photoId" },
                { status: 400 }
            );
        }

        await prisma.mCItemPhoto.delete({
            where: { id: photoId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting item photo:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette bilde" },
            { status: 500 }
        );
    }
}
