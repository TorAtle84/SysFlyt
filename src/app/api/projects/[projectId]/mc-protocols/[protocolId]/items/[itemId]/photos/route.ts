import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { saveFile, deleteFile as deleteStorageFile, generateSecureFileName } from "@/lib/file-utils";

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

        // Generate unique filename with mc-photo prefix
        const secureFileName = generateSecureFileName(file.name);
        const fileName = `mc-photos/${itemId}_${secureFileName}`;

        // Upload to Supabase Storage
        const bytes = await file.arrayBuffer();
        const result = await saveFile(projectId, fileName, Buffer.from(bytes));

        if (!result.success) {
            console.error("Supabase upload error:", result.error);
            return NextResponse.json(
                { error: result.error || "Kunne ikke laste opp bilde" },
                { status: 500 }
            );
        }

        // Create database entry with the storage path
        const photo = await prisma.mCItemPhoto.create({
            data: {
                itemId,
                fileUrl: result.path,
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

        // Get photo to find file path for storage deletion
        const photo = await prisma.mCItemPhoto.findUnique({
            where: { id: photoId },
        });

        if (photo?.fileUrl) {
            // Delete from Supabase Storage
            await deleteStorageFile(projectId, photo.fileUrl);
        }

        // Delete from database
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
