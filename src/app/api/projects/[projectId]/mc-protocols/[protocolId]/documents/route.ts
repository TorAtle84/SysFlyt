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
        }>;
    }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const documents = await prisma.mCSystemDocument.findMany({
            where: { protocolId },
            orderBy: { uploadedAt: "desc" },
        });

        return NextResponse.json({ documents });
    } catch (error) {
        console.error("Error fetching protocol documents:", error);
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
        params: Promise<{
            projectId: string;
            protocolId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "Ingen fil mottatt" },
                { status: 400 }
            );
        }

        // Generate unique filename
        const ext = path.extname(file.name);
        const baseName = path.basename(file.name, ext);
        const timestamp = Date.now();
        const fileName = `${timestamp}_${baseName}${ext}`;

        // Save to files directory
        const uploadDir = path.join(process.cwd(), "public", "files", projectId, "protocols");
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, fileName);
        const bytes = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(bytes));

        // Create database entry
        const fileUrl = `/files/${projectId}/protocols/${fileName}`;
        const document = await prisma.mCSystemDocument.create({
            data: {
                protocolId,
                fileName: file.name,
                fileUrl,
            },
        });

        return NextResponse.json({ document });
    } catch (error) {
        console.error("Error uploading protocol document:", error);
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
        params: Promise<{
            projectId: string;
            protocolId: string;
        }>;
    }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const { searchParams } = new URL(request.url);
        const documentId = searchParams.get("documentId");

        if (!documentId) {
            return NextResponse.json(
                { error: "Mangler documentId" },
                { status: 400 }
            );
        }

        await prisma.mCSystemDocument.delete({
            where: { id: documentId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting protocol document:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette dokument" },
            { status: 500 }
        );
    }
}
