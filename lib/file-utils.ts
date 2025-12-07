import path from "path";
import { mkdir, writeFile, unlink, stat } from "fs/promises";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  document: [".pdf"],
  spreadsheet: [".xlsx", ".xls"],
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp"],
};

const MAX_FILE_SIZES: Record<string, number> = {
  document: 50 * 1024 * 1024, // 50MB for PDFs
  spreadsheet: 10 * 1024 * 1024, // 10MB for Excel files
  image: 5 * 1024 * 1024, // 5MB for images
};

export type FileValidationResult = 
  | { valid: true; type: string }
  | { valid: false; error: string };

export function validateFileName(fileName: string): FileValidationResult {
  if (!fileName || typeof fileName !== "string") {
    return { valid: false, error: "Filnavn er påkrevd" };
  }

  if (fileName.includes("..") || fileName.includes("~") || fileName.includes("/") || fileName.includes("\\")) {
    return { valid: false, error: "Ugyldig filnavn" };
  }

  const ext = path.extname(fileName).toLowerCase();
  
  for (const [type, extensions] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (extensions.includes(ext)) {
      return { valid: true, type };
    }
  }

  return { valid: false, error: `Filtypen ${ext} er ikke tillatt` };
}

export function validateFileSize(size: number, fileType: string): FileValidationResult {
  const maxSize = MAX_FILE_SIZES[fileType];
  
  if (!maxSize) {
    return { valid: false, error: "Ukjent filtype" };
  }

  if (size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `Filen er for stor. Maks størrelse er ${maxMB}MB` };
  }

  return { valid: true, type: fileType };
}

export function validateFileMimeType(mimeType: string, fileType: string): FileValidationResult {
  const validMimeTypes: Record<string, string[]> = {
    document: ["application/pdf"],
    spreadsheet: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  };

  const allowed = validMimeTypes[fileType];
  if (!allowed || !allowed.includes(mimeType)) {
    return { valid: false, error: "Ugyldig filtype" };
  }

  return { valid: true, type: fileType };
}

export async function saveFile(
  projectId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ success: true; path: string } | { success: false; error: string }> {
  try {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    
    const projectDir = path.join(UPLOADS_DIR, projectId);
    await mkdir(projectDir, { recursive: true });
    
    const filePath = path.join(projectDir, uniqueFileName);
    
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(UPLOADS_DIR)) {
      return { success: false, error: "Ugyldig filsti" };
    }
    
    await writeFile(filePath, buffer);
    
    return { success: true, path: `/api/files/${projectId}/${uniqueFileName}` };
  } catch (error) {
    console.error("Error saving file:", error);
    return { success: false, error: "Kunne ikke lagre fil" };
  }
}

export async function deleteFile(
  projectId: string,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = path.join(UPLOADS_DIR, projectId, fileName);
    
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(UPLOADS_DIR)) {
      return { success: false, error: "Ugyldig filsti" };
    }
    
    await unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error("Error deleting file:", error);
    return { success: false, error: "Kunne ikke slette fil" };
  }
}

export async function fileExists(
  projectId: string,
  fileName: string
): Promise<boolean> {
  try {
    const filePath = path.join(UPLOADS_DIR, projectId, fileName);
    const normalizedPath = path.normalize(filePath);
    
    if (!normalizedPath.startsWith(UPLOADS_DIR)) {
      return false;
    }
    
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function generateSecureFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 100);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  return `${timestamp}_${random}_${baseName}${ext}`;
}
