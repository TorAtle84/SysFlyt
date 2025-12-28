import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import JSZip from "jszip";
import path from "path";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import {
  buildFdvManifest,
  buildFdvSummary,
  type FdvComponentCoverage,
  type FdvManifestComponent,
  type FdvManifestFile,
  type FdvSystemEntry,
} from "@/lib/fdv-collection";

const FDV_STORAGE_PREFIX = "/files/fdv/storage/";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function resolveFdvStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  let normalized = fileUrl;
  if (fileUrl.startsWith("http")) {
    try {
      normalized = new URL(fileUrl).pathname;
    } catch {
      return null;
    }
  }
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (!normalized.startsWith(FDV_STORAGE_PREFIX)) return null;
  const relativePath = normalized.replace(/^\//, "");
  const absolutePath = path.resolve(process.cwd(), "public", relativePath);
  const storageRoot = path.resolve(process.cwd(), "public", "files", "fdv", "storage");
  if (!absolutePath.startsWith(storageRoot)) return null;
  return absolutePath;
}

function resolveComponentId(item: {
  id: string;
  massList?: { id: string; tfm: string | null };
}): string {
  return item.massList?.tfm || item.massList?.id || item.id;
}

function resolveComponentName(item: {
  massList?: { component: string | null; description: string | null; productName: string | null };
}): string {
  return (
    item.massList?.component ||
    item.massList?.description ||
    item.massList?.productName ||
    "Ukjent komponent"
  );
}

function resolveSystemCode(item: {
  massList?: { system: string | null };
  protocol?: { systemCode: string };
}): string | null {
  return item.massList?.system || item.protocol?.systemCode || null;
}

function resolveSystemName(item: { protocol?: { systemName: string | null } }): string | null {
  return item.protocol?.systemName || null;
}

function mapDocType(type: string | null): string {
  if (type === "INSTALLATION") return "montasje";
  return "datablad";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    let allowMissing = false;
    try {
      const body = await request.json();
      allowMissing = Boolean(body?.allowMissing);
    } catch {
      allowMissing = false;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
    }

    const items = await prisma.mCProtocolItem.findMany({
      where: { protocol: { projectId } },
      include: {
        massList: {
          select: {
            id: true,
            tfm: true,
            system: true,
            component: true,
            description: true,
            productName: true,
            supplierName: true,
          },
        },
        protocol: {
          select: { systemCode: true, systemName: true },
        },
        product: {
          select: {
            name: true,
            supplier: { select: { name: true } },
            datasheets: {
              select: { id: true, fileName: true, fileUrl: true, fileHash: true, type: true },
            },
          },
        },
      },
      orderBy: {
        massList: { tfm: "asc" },
      },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Ingen komponenter funnet for prosjektet" },
        { status: 400 }
      );
    }

    const systemsMap = new Map<string, FdvSystemEntry>();
    const uniqueFileKeys = new Set<string>();
    const coverageComponents: FdvComponentCoverage[] = [];
    const manifestComponents: FdvManifestComponent[] = [];
    const fileEntries = new Map<string, { entry: FdvManifestFile; buffer: Buffer }>();
    const fileCache = new Map<string, string>();
    const missingFiles = new Set<string>();

    async function ensureFileEntry(datasheet: {
      id: string;
      fileName: string;
      fileUrl: string;
      fileHash: string | null;
      type: string | null;
    }): Promise<string> {
      const cacheKey = datasheet.fileHash || datasheet.fileUrl || datasheet.id;
      const cached = fileCache.get(cacheKey);
      if (cached) return cached;

      const storagePath = resolveFdvStoragePath(datasheet.fileUrl);
      if (!storagePath) {
        missingFiles.add(datasheet.fileUrl || datasheet.fileName);
        return "";
      }

      const buffer = await readFile(storagePath);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const ext = path.extname(storagePath) || path.extname(datasheet.fileName);
      const zipFileName = `${sha256}${ext}`;
      const zipPath = path.posix.join("datablader", zipFileName);

      if (!fileEntries.has(sha256)) {
        const entry: FdvManifestFile = {
          id: sha256,
          path: zipPath,
          name: sanitizeFileName(datasheet.fileName || zipFileName),
          mime: getMimeType(datasheet.fileName || zipFileName),
          size: buffer.length,
          sha256,
        };
        fileEntries.set(sha256, { entry, buffer });
      }

      fileCache.set(cacheKey, sha256);
      return sha256;
    }

    for (const item of items) {
      const systemCode = resolveSystemCode(item);
      if (systemCode) {
        const systemName = resolveSystemName(item);
        systemsMap.set(systemCode, { code: systemCode, name: systemName });
      }

      const datasheets = item.product?.datasheets || [];
      datasheets.forEach((ds) => {
        uniqueFileKeys.add(ds.fileHash || ds.fileUrl || ds.id);
      });

      const componentFiles: FdvManifestComponent["files"] = [];
      for (const datasheet of datasheets) {
        const fileId = await ensureFileEntry(datasheet);
        if (!fileId) continue;
        componentFiles.push({ fileId, docType: mapDocType(datasheet.type) });
      }

      const hasFdv = datasheets.length > 0;
      coverageComponents.push({
        id: resolveComponentId(item),
        systemCode,
        name: resolveComponentName(item),
        hasFdv,
      });

      manifestComponents.push({
        id: resolveComponentId(item),
        tfm: item.massList?.tfm || null,
        systemCode,
        systemName: resolveSystemName(item),
        name: resolveComponentName(item),
        productName: item.product?.name || item.massList?.productName || null,
        supplierName: item.product?.supplier?.name || item.massList?.supplierName || null,
        files: componentFiles,
      });
    }

    const { summary, missingComponents } = buildFdvSummary(
      coverageComponents,
      uniqueFileKeys.size
    );

    if (missingComponents.length > 0 && !allowMissing) {
      return NextResponse.json(
        {
          error: "Mangler FDV for en eller flere komponenter",
          missingComponents,
        },
        { status: 400 }
      );
    }

    if (missingFiles.size > 0) {
      return NextResponse.json(
        {
          error: "Noen FDV-filer mangler i lagringen",
          missingFiles: Array.from(missingFiles),
        },
        { status: 404 }
      );
    }

    const manifest = buildFdvManifest({
      project,
      components: manifestComponents,
      files: Array.from(fileEntries.values()).map((entry) => entry.entry),
      missingComponents,
      summary,
      exportedWithMissing: allowMissing && missingComponents.length > 0,
      systems: Array.from(systemsMap.values()),
    });

    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    for (const { entry, buffer } of fileEntries.values()) {
      zip.file(entry.path, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const safeProjectName = sanitizeFileName(project.name).slice(0, 40) || "prosjekt";
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `fdv-samling_${safeProjectName}_${stamp}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error("FDV export error:", error);
    return NextResponse.json(
      { error: "Kunne ikke generere FDV-samling" },
      { status: 500 }
    );
  }
}
