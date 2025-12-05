import prisma from "@/lib/db";
import { extractTextFromPDF, findComponentsInText, ExtractedComponent } from "./pdf-text-extractor";
import { readFile } from "fs/promises";
import path from "path";

export interface VerificationResult {
  documentId: string;
  totalComponents: number;
  matchedComponents: number;
  unmatchedComponents: ExtractedComponent[];
  matches: {
    component: ExtractedComponent;
    massListItem: {
      id: string;
      tfm: string | null;
      system: string | null;
      component: string | null;
      productName: string | null;
      location: string | null;
    };
  }[];
}

export interface ScanResult {
  documentId: string;
  components: ExtractedComponent[];
  systemCodes: string[];
}

export async function scanDocumentForComponents(
  documentId: string
): Promise<ScanResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      url: true,
      title: true,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  const filePath = path.join(process.cwd(), "uploads", document.url);
  
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await readFile(filePath);
  } catch {
    const altPath = path.join(process.cwd(), document.url);
    try {
      pdfBuffer = await readFile(altPath);
    } catch {
      throw new Error("Could not read PDF file");
    }
  }

  const { items } = await extractTextFromPDF(pdfBuffer);
  const components = findComponentsInText(items);
  
  const systemCodes = [...new Set(
    components
      .map((c) => c.system)
      .filter((s): s is string => s !== null)
  )];

  return {
    documentId,
    components,
    systemCodes,
  };
}

export async function verifyAgainstMassList(
  projectId: string,
  documentId: string
): Promise<VerificationResult> {
  const scanResult = await scanDocumentForComponents(documentId);
  
  const massList = await prisma.massList.findMany({
    where: { projectId },
    select: {
      id: true,
      tfm: true,
      system: true,
      component: true,
      productName: true,
      location: true,
    },
  });

  const matches: VerificationResult["matches"] = [];
  const matchedCodes = new Set<string>();

  for (const comp of scanResult.components) {
    const normalizedCode = comp.code.replace(/[.\-_]/g, "").toLowerCase();
    
    for (const massItem of massList) {
      const tfmNormalized = (massItem.tfm || "").replace(/[.\-_]/g, "").toLowerCase();
      const componentNormalized = (massItem.component || "").replace(/[.\-_]/g, "").toLowerCase();
      
      if (
        tfmNormalized.includes(normalizedCode) ||
        normalizedCode.includes(tfmNormalized) ||
        componentNormalized === normalizedCode ||
        (massItem.system && comp.system && massItem.system === comp.system)
      ) {
        matches.push({
          component: comp,
          massListItem: massItem,
        });
        matchedCodes.add(comp.code);
        break;
      }
    }
  }

  const unmatchedComponents = scanResult.components.filter(
    (c) => !matchedCodes.has(c.code)
  );

  return {
    documentId,
    totalComponents: scanResult.components.length,
    matchedComponents: matches.length,
    unmatchedComponents,
    matches,
  };
}

export async function saveComponentsToDocument(
  documentId: string,
  components: ExtractedComponent[]
): Promise<number> {
  let savedCount = 0;

  for (const comp of components) {
    try {
      await prisma.documentComponent.upsert({
        where: {
          documentId_code: {
            documentId,
            code: comp.code,
          },
        },
        update: {
          system: comp.system,
          x: comp.x,
          y: comp.y,
          page: comp.page,
        },
        create: {
          documentId,
          code: comp.code,
          system: comp.system,
          x: comp.x,
          y: comp.y,
          page: comp.page,
        },
      });
      savedCount++;
    } catch (error) {
      console.error(`Error saving component ${comp.code}:`, error);
    }
  }

  return savedCount;
}
