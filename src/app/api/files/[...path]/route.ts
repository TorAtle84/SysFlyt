import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-helpers";
import prisma from "@/lib/db";
import { readFile, stat } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".ifc": "application/octet-stream",
  ".rvt": "application/octet-stream",
  ".bim": "application/octet-stream",
};

function extractModelIdFromModelPath(relativePath: string): string | null {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length < 3) return null;

  // models/converted/{modelId}/...
  if (parts[0] === "models" && parts[1] === "converted" && parts[2]) {
    return parts[2];
  }

  // models/originals/{modelId}_original.ifc
  if (parts[0] === "models" && parts[1] === "originals" && parts[2]) {
    const file = parts[2];
    const marker = "_original";
    const idx = file.indexOf(marker);
    if (idx > 0) {
      return file.slice(0, idx);
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    
    if (!pathSegments || pathSegments.length < 2) {
      return NextResponse.json({ error: "Ugyldig filsti" }, { status: 400 });
    }

    const projectId = pathSegments[0];
    const fileName = pathSegments.slice(1).join("/");

    if (fileName.includes("..") || fileName.includes("~")) {
      return NextResponse.json({ error: "Ugyldig filsti" }, { status: 400 });
    }

    // Ensure the requested file belongs to a known resource in this project.
    if (fileName.startsWith("models/")) {
      const modelId = extractModelIdFromModelPath(fileName);
      if (!modelId) {
        return NextResponse.json({ error: "Modell ikke funnet" }, { status: 404 });
      }

      const model = await prisma.bimModel.findFirst({
        where: { id: modelId, projectId },
        select: { id: true },
      });

      if (!model) {
        return NextResponse.json({ error: "Modell ikke funnet" }, { status: 404 });
      }
    } else {
      const document = await prisma.document.findFirst({
        where: {
          projectId,
          OR: [{ fileUrl: { contains: fileName } }, { fileName: fileName }],
        },
        select: { id: true, projectId: true },
      });

      if (!document) {
        return NextResponse.json({ error: "Dokument ikke funnet" }, { status: 404 });
      }
    }

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const filePath = path.join(UPLOADS_DIR, projectId, fileName);
    const normalizedPath = path.normalize(filePath);
    
    if (!normalizedPath.startsWith(UPLOADS_DIR)) {
      return NextResponse.json({ error: "Ugyldig filsti" }, { status: 400 });
    }

    try {
      await stat(normalizedPath);
    } catch {
      return NextResponse.json({ error: "Fil ikke funnet" }, { status: 404 });
    }

    const fileBuffer = await readFile(normalizedPath);
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(fileName))}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente fil" },
      { status: 500 }
    );
  }
}
