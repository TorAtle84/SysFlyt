import path from "path";
import { mkdir, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { ModelFormat } from "@prisma/client";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const MODEL_ALLOWED_EXTENSIONS: Record<string, ModelFormat> = {
  ".ifc": ModelFormat.IFC,
  ".rvt": ModelFormat.RVT,
  ".bim": ModelFormat.BIM,
};

const DEFAULT_MAX_MODEL_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export type ModelFileNameValidationResult =
  | { valid: true; format: ModelFormat; ext: string }
  | { valid: false; error: string };

export function validateModelFileName(fileName: string): ModelFileNameValidationResult {
  if (!fileName || typeof fileName !== "string") {
    return { valid: false, error: "Filnavn er påkrevd" };
  }

  if (fileName.includes("..") || fileName.includes("~") || fileName.includes("/") || fileName.includes("\\")) {
    return { valid: false, error: "Ugyldig filnavn" };
  }

  const ext = path.extname(fileName).toLowerCase();
  const format = MODEL_ALLOWED_EXTENSIONS[ext];
  if (!format) {
    return { valid: false, error: `Filtypen ${ext} er ikke støttet (IFC/RVT/BIM)` };
  }

  return { valid: true, format, ext };
}

export type ModelFileSizeValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateModelFileSize(size: number): ModelFileSizeValidationResult {
  const envMaxMb = process.env.MODEL_MAX_UPLOAD_MB ? Number(process.env.MODEL_MAX_UPLOAD_MB) : null;
  const maxBytes = Number.isFinite(envMaxMb) && envMaxMb && envMaxMb > 0
    ? Math.floor(envMaxMb * 1024 * 1024)
    : DEFAULT_MAX_MODEL_SIZE_BYTES;

  if (size > maxBytes) {
    const maxMB = Math.round(maxBytes / (1024 * 1024));
    return { valid: false, error: `Filen er for stor. Maks størrelse er ${maxMB}MB` };
  }

  return { valid: true };
}

export function getModelOriginalRelativePath(modelId: string, ext: string): string {
  return path.posix.join("models", "originals", `${modelId}_original${ext}`);
}

export function getModelConvertedDirRelativePath(modelId: string): string {
  return path.posix.join("models", "converted", modelId);
}

export function getModelArtifactRelativePath(modelId: string, fileName: string): string {
  return path.posix.join(getModelConvertedDirRelativePath(modelId), fileName);
}

export function getUploadsProjectDirFsPath(projectId: string): string {
  return path.join(UPLOADS_DIR, projectId);
}

export function getUploadsPathFsPath(projectId: string, relativePath: string): string {
  return path.join(getUploadsProjectDirFsPath(projectId), relativePath);
}

export function getUploadsPathApiPath(projectId: string, relativePath: string): string {
  // NOTE: must use POSIX separators for URL paths
  return `/api/files/${encodeURIComponent(projectId)}/${relativePath}`;
}

export async function saveModelOriginalFile(params: {
  projectId: string;
  modelId: string;
  ext: string;
  file: File;
}): Promise<{ success: true; relativePath: string; apiPath: string } | { success: false; error: string }> {
  try {
    const { projectId, modelId, ext, file } = params;

    const relativePath = getModelOriginalRelativePath(modelId, ext);
    const fsPath = getUploadsPathFsPath(projectId, relativePath);

    const dir = path.dirname(fsPath);
    await mkdir(dir, { recursive: true });

    const webStream = file.stream() as any;
    const nodeStream = Readable.fromWeb(webStream);
    await pipeline(nodeStream, createWriteStream(fsPath, { flags: "wx" }));

    return {
      success: true,
      relativePath,
      apiPath: getUploadsPathApiPath(projectId, relativePath),
    };
  } catch (error) {
    console.error("Error saving model file:", error);
    return { success: false, error: "Kunne ikke lagre modellfil" };
  }
}

export async function ensureModelConvertedDir(params: { projectId: string; modelId: string }): Promise<string> {
  const relativeDir = getModelConvertedDirRelativePath(params.modelId);
  const fsDir = getUploadsPathFsPath(params.projectId, relativeDir);
  await mkdir(fsDir, { recursive: true });
  return fsDir;
}

export async function deleteModelFiles(params: { projectId: string; modelId: string }): Promise<void> {
  const { projectId, modelId } = params;
  const projectDir = getUploadsProjectDirFsPath(projectId);
  const modelsDir = path.join(projectDir, "models");
  const convertedDir = path.join(modelsDir, "converted", modelId);

  const normalizedProjectDir = path.normalize(projectDir);
  const normalizedConvertedDir = path.normalize(convertedDir);

  if (!normalizedConvertedDir.startsWith(normalizedProjectDir)) {
    throw new Error("Ugyldig filsti");
  }

  await rm(convertedDir, { recursive: true, force: true });

  // Remove originals matching `{modelId}_original.*`
  const originalsDir = path.join(modelsDir, "originals");
  const normalizedOriginalsDir = path.normalize(originalsDir);
  if (!normalizedOriginalsDir.startsWith(normalizedProjectDir)) {
    throw new Error("Ugyldig filsti");
  }

  await rm(path.join(originalsDir, `${modelId}_original.ifc`), { force: true });
  await rm(path.join(originalsDir, `${modelId}_original.rvt`), { force: true });
  await rm(path.join(originalsDir, `${modelId}_original.bim`), { force: true });
}
