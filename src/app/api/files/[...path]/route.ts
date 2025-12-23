import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-helpers";
import prisma from "@/lib/db";
import { createClient } from "@supabase/supabase-js";
import path from "path";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET_NAME = "documents";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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
    } else if (fileName.includes("mc-photos")) {
      // MC Protocol photos - check MCItemPhoto table
      const photo = await prisma.mCItemPhoto.findFirst({
        where: {
          fileUrl: { contains: fileName },
        },
        select: { id: true, item: { select: { protocol: { select: { projectId: true } } } } },
      });

      if (!photo || photo.item.protocol.projectId !== projectId) {
        return NextResponse.json({ error: "Bilde ikke funnet" }, { status: 404 });
      }
    } else if (fileName.includes("comparisons/")) {
      // TFM Comparisons - check TfmComparison table
      const comparison = await prisma.tfmComparison.findFirst({
        where: {
          projectId,
          fileUrl: { contains: fileName },
        },
        select: { id: true },
      });

      if (!comparison) {
        return NextResponse.json({ error: "Sammenligning ikke funnet" }, { status: 404 });
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

    // Construct path in Supabase bucket
    const storagePath = `${projectId}/${fileName}`;

    // Download file from Supabase using Service Role (bypasses RLS)
    const { data: fileBlob, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error || !fileBlob) {
      console.error("Supabase download error:", error);
      return NextResponse.json({ error: "Fil ikke funnet i skyen" }, { status: 404 });
    }

    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

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
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente fil" },
      { status: 500 }
    );
  }
}
