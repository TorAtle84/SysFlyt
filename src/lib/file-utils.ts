import path from "path";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Warning if keys are missing (will fail on use but allows build)
if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase env vars for storage");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const BUCKET_NAME = "documents";

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


function detectContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

export async function saveFile(
  projectId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ success: true; path: string } | { success: false; error: string }> {
  try {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._\/-]/g, "_");
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const filePath = `${projectId}/${uniqueFileName}`; // Folder structure in bucket

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: detectContentType(fileName),
        upsert: false,
      });

    if (error) {
      console.error("Supabase Storage Upload Error:", error);
      return { success: false, error: "Kunne ikke lagre fil til skyen" };
    }

    // Return proxy URL (our API will fetch from Supabase securely)
    // This works with private buckets since our server uses service_role key
    return { success: true, path: `/api/files/${projectId}/${uniqueFileName}` };
  } catch (error) {
    console.error("Error saving file:", error);
    return { success: false, error: "Kunne ikke lagre fil" };
  }
}

export async function deleteFile(
  projectId: string,
  fileUrlOrName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Extract file path from URL if full URL is passed
    let filePath = fileUrlOrName;
    if (fileUrlOrName.includes("/storage/v1/object/public/documents/")) {
      filePath = fileUrlOrName.split("/storage/v1/object/public/documents/")[1];
    } else if (!fileUrlOrName.includes("/")) {
      // Assuming just filename passed, construct path
      filePath = `${projectId}/${fileUrlOrName}`;
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error("Supabase delete error:", error);
      return { success: false, error: "Kunne ikke slette fil fra skyen" };
    }

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
    // NOTE: Checking file existence efficiently in storage can be done by listing or metadata.
    // For now, we assume true if it's in DB, or we could implement a list check.
    // To keep it simple and avoid extra API calls, we'll just return true or implement a head check if critical.
    // Let's list files in the project folder with the name.

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(projectId, {
        search: fileName,
        limit: 1
      });

    if (error || !data) return false;
    return data.length > 0;
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
