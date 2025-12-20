import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { existsSync } from "fs";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: productId } = await params;

        const datasheets = await prisma.productDatasheet.findMany({
            where: { productId },
            orderBy: { uploadedAt: "desc" },
        });

        return NextResponse.json({ datasheets });
    } catch (error) {
        console.error("Error fetching datasheets:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente datablader" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: productId } = await params;
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const type = formData.get("type") as string || "DATASHEET";

        if (!file) {
            return NextResponse.json(
                { error: "Ingen fil mottatt" },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Calculate SHA-256 hash
        const hashSum = crypto.createHash('sha256');
        hashSum.update(buffer);
        const fileHash = hashSum.digest('hex');

        // Check if file with same hash already exists
        const existingDatasheet = await prisma.productDatasheet.findFirst({
            where: { fileHash },
        });

        if (existingDatasheet) {
            // Re-use existing file
            const datasheet = await prisma.productDatasheet.create({
                data: {
                    productId,
                    fileName: file.name,
                    fileUrl: existingDatasheet.fileUrl,
                    fileHash,
                    type,
                },
            });
            return NextResponse.json({ datasheet, reused: true });
        }

        // Save new file
        const ext = path.extname(file.name);
        // Use hash-based filename for storage to avoid collisions/duplication on disk
        const storageFileName = `${fileHash}${ext}`;

        // Use a central storage folder for FDV documents
        const uploadDir = path.join(process.cwd(), "public", "files", "fdv", "storage");
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, storageFileName);

        // Check if file exists (just in case hash matched but DB entry was missing, unlikely but safe)
        if (!existsSync(filePath)) {
            await writeFile(filePath, buffer);
        }

        const fileUrl = `/files/fdv/storage/${storageFileName}`;

        const datasheet = await prisma.productDatasheet.create({
            data: {
                productId,
                fileName: file.name,
                fileUrl,
                fileHash,
                type,
            },
        });

        return NextResponse.json({ datasheet });
    } catch (error) {
        console.error("Error uploading datasheet:", error);
        return NextResponse.json(
            { error: "Kunne ikke laste opp datablad" },
            { status: 500 }
        );
    }
}

