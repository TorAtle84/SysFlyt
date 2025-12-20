import prisma from "@/lib/db";
import {
  extractTextFromPDF,
  findComponentsInText,
  findSystemsInText,
  extractPlainTextFromPDF,
  parseSystemTagsFromText,
  findMatchesInText,
  convertPatternToRegex,
  ExtractedComponent,
  ExtractedSystemCode,
  PatternMatch,
} from "./pdf-text-extractor";
import { pointInPolygon, Point, calculatePolygonArea } from "./geometry-utils";
import { matchesComponentPattern, ParsedComponent } from "./id-pattern";
import { getTFMVariants } from "./tfm-id";
import { readFile } from "fs/promises";
import path from "path";
import type { MassList } from "@prisma/client";
import { appendFileSync } from "fs";

function logDebug(msg: string) {
  try {
    appendFileSync("server-debug.log", `[${new Date().toISOString()}] [SCAN] ${msg}\n`);
  } catch (e) {
    // ignore
  }
}

const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

async function readDocumentPdf(document: {
  id: string;
  url: string;
  fileUrl?: string | null;
  projectId: string;
}): Promise<Buffer> {
  logDebug(`Reading PDF for doc ${document.id} (${document.url})`);
  const candidates = new Set<string>();

  const addFromUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return;
    const normalized = rawUrl.startsWith("/") ? rawUrl.slice(1) : rawUrl;
    const apiPrefix = "api/files/";

    if (normalized.startsWith(apiPrefix)) {
      const relativePath = normalized.slice(apiPrefix.length);
      const candidate = path.join(UPLOADS_DIR, relativePath);
      candidates.add(candidate);
    }

    // Also try treating the url as a relative path on disk
    candidates.add(path.join(process.cwd(), normalized));

    // Fallback: combine projectId with basename
    const baseName = path.basename(normalized);
    candidates.add(path.join(UPLOADS_DIR, document.projectId, baseName));
  };

  addFromUrl(document.fileUrl);
  addFromUrl(document.url);

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!normalized.startsWith(UPLOADS_DIR)) continue;

    try {
      return await readFile(normalized);
    } catch {
      continue;
    }
  }

  logDebug("Failed to read PDF file from any candidate path");
  throw new Error("Could not read PDF file");
}

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
  debugInfo?: {
    textItems: number;
    polygons: number;
    geometryAssigned: number;
  };
}

export interface ScanOptions {
  enableGeometry?: boolean;
  previewPolygon?: {
    points: Point[];
    systemCode: string;
    pageNumber: number;
  };
  whitelistPatterns?: RegExp[];
  precisionMode?: boolean;
}

/**
 * Scan document for components with optional geometry-based system assignment
 */
export async function scanDocumentForComponents(
  documentId: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  logDebug(`scanDocumentForComponents started for ${documentId}. Geometry: ${options.enableGeometry}`);
  let geometryAssigned = 0;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      url: true,
      fileUrl: true,
      title: true,
      systemTags: true,
      projectId: true,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  // Read PDF file
  const pdfBuffer = await readDocumentPdf(document);

  // Extract text with coordinates
  const { items } = await extractTextFromPDF(pdfBuffer);
  logDebug(`Extracted ${items.length} text items.`);
  const plainText = await extractPlainTextFromPDF(pdfBuffer);

  // Detect system codes directly from text (tfmrules)
  const detectedSystems = findSystemsInText(items);
  const detectedSystemFromText = parseSystemTagsFromText(plainText);

  // Default system from document tags
  const defaultSystem =
    detectedSystems[0]?.code ||
    detectedSystemFromText[0] ||
    (document.systemTags.length > 0 ? document.systemTags[0] : undefined);

  // Parse components from text
  let components = findComponentsInText(items, defaultSystem);
  logDebug(`Parsed ${components.length} components from structured text.`);

  // Fallback: if no components found from positioned text, try plain text parsing (no coordinates)
  if (components.length === 0 && plainText) {
    logDebug("Falling back to plain text parsing (no coords)");
    const parsedFallback = findComponentsInText(
      // Reuse parser by converting plain text to pseudo items (keeps parser logic consistent)
      plainText.split("\n").map((line, idx) => ({
        text: line,
        x: 0,
        y: idx,
        width: 0,
        height: 0,
        page: 1,
      })),
      defaultSystem
    ).map((c) => ({
      ...c,
      x: c.x ?? 0,
      y: c.y ?? 0,
      width: c.width ?? 0,
      height: c.height ?? 0,
      page: c.page ?? 1,
      verifiedByText: c.verifiedByText ?? false,
    }));

    // If still nothing, parse with parseComponentIds directly (plain text) and map to ExtractedComponent without coordinates
    components = parsedFallback;
  }

  logDebug(`Components before filtering/geometry: ${components.length}`);

  // Apply whitelist filtering if patterns provided
  if (options.whitelistPatterns && options.whitelistPatterns.length > 0) {
    components = components.filter((c) =>
      matchesComponentPattern(c.code, options.whitelistPatterns!)
    );
  }

  // GEOMETRY-BASED SYSTEM ASSIGNMENT
  // Default to checking for geometry if not explicitly disabled
  const shouldCheckGeometry = options.enableGeometry !== false;

  if (shouldCheckGeometry) {
    let polygons: Array<{
      points: Point[];
      systemCode: string;
      pageNumber: number;
    }> = [];

    // If preview polygon provided, use it (and force geometry enabled)
    if (options.previewPolygon) {
      polygons = [options.previewPolygon];
    } else {
      // Fetch system annotations (polygons) from database
      const systemAnnotations = await prisma.systemAnnotation.findMany({
        where: {
          documentId,
          type: "SYSTEM",
          systemCode: { not: null },
        },
        select: {
          systemCode: true,
          pageNumber: true,
          points: true,
        },
      });

      polygons = systemAnnotations
        .map((ann) => {
          const points = (ann.points as Point[] | null) || [];
          return {
            systemCode: ann.systemCode!,
            pageNumber: ann.pageNumber,
            points,
          };
        })
        .filter((p) => p.points.length >= 3);
    }

    logDebug(`Found ${polygons.length} system polygons. Options.enableGeometry=${options.enableGeometry}`);

    // Proceed if we have polygons to work with
    if (polygons.length > 0) {
      // Validate polygons for debugging
      for (const polygon of polygons) {
        const bounds = polygon.points.reduce((acc, p) => ({
          minX: Math.min(acc.minX, p.x),
          maxX: Math.max(acc.maxX, p.x),
          minY: Math.min(acc.minY, p.y),
          maxY: Math.max(acc.maxY, p.y),
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        logDebug(`Polygon ${polygon.systemCode} (page ${polygon.pageNumber}): bounds X[${bounds.minX.toFixed(2)}-${bounds.maxX.toFixed(2)}] Y[${bounds.minY.toFixed(2)}-${bounds.maxY.toFixed(2)}]`);
      }

      // Assign system based on geometry - use SMALLEST containing polygon
      for (const component of components) {
        // Find polygons on the same page
        const pagePolygons = polygons.filter((p) => p.pageNumber === component.page);

        // Calculate center point of component
        const centerX = component.x + (component.width || 0) / 2;
        const centerY = component.y + (component.height || 0) / 2;

        // Find ALL containing polygons and select the smallest
        let bestPolygon: { systemCode: string; area: number } | null = null;

        for (const polygon of pagePolygons) {
          // Check if center is inside polygon
          const isInside = pointInPolygon({ x: centerX, y: centerY }, polygon.points);

          if (isInside) {
            // Calculate polygon area
            const area = calculatePolygonArea(polygon.points);

            // Select smallest containing polygon
            if (!bestPolygon || area < bestPolygon.area) {
              bestPolygon = { systemCode: polygon.systemCode, area };
            }
          }
        }

        if (bestPolygon) {
          component.system = bestPolygon.systemCode;
          geometryAssigned++;
        }

        // Log first 5 components for debugging
        if (components.indexOf(component) < 5) {
          logDebug(`Component ${component.code} at (${centerX.toFixed(2)}, ${centerY.toFixed(2)}) page ${component.page} -> ${bestPolygon?.systemCode || component.system || "NO MATCH"}`);
        }
      }

      console.log(`Geometry assigned: ${geometryAssigned}/${components.length}`);
      logDebug(`Geometry assigned: ${geometryAssigned}/${components.length}`);
    }
  }

  // OUTLIER REMOVAL
  // Group by system and analyze component patterns
  const systemGroups = new Map<string, ExtractedComponent[]>();
  for (const comp of components) {
    const sys = comp.system || "UNKNOWN";
    if (!systemGroups.has(sys)) {
      systemGroups.set(sys, []);
    }
    systemGroups.get(sys)!.push(comp);
  }

  const filteredComponents: ExtractedComponent[] = [];

  for (const [, sysComponents] of systemGroups) {
    if (sysComponents.length < 4) {
      // Too few to determine pattern, keep all
      filteredComponents.push(...sysComponents);
      continue;
    }

    // Extract patterns
    const patterns = new Map<string, number>();
    for (const comp of sysComponents) {
      const pattern = comp.code.replace(/\d/g, '0'); // AA0000 pattern
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }

    // Find dominant pattern (appears in 75%+ of components)
    const total = sysComponents.length;
    let dominantPattern: string | null = null;

    for (const [pattern, count] of patterns) {
      if (count / total >= 0.75) {
        dominantPattern = pattern;
        break;
      }
    }

    if (dominantPattern) {
      // Keep only components matching dominant pattern
      for (const comp of sysComponents) {
        const compPattern = comp.code.replace(/\d/g, '0');
        if (compPattern === dominantPattern) {
          filteredComponents.push(comp);
        }
      }
    } else {
      // No dominant pattern, keep all
      filteredComponents.push(...sysComponents);
    }
  }

  // DEDUPLICATE
  const seen = new Set<string>();
  const dedupedComponents: ExtractedComponent[] = [];

  for (const comp of filteredComponents) {
    const key = `${comp.system || 'NULL'}-${comp.code}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedComponents.push(comp);
    }
  }

  // Extract unique system codes
  const systemCodes = [
    ...new Set([
      ...dedupedComponents
        .map((c) => c.system)
        .filter((s): s is string => s !== null),
      ...detectedSystems.map((s) => s.code),
      ...detectedSystemFromText,
    ]),
  ];

  logDebug(`Final components count: ${dedupedComponents.length}`);

  return {
    documentId,
    components: dedupedComponents,
    systemCodes,
    debugInfo: {
      textItems: items.length,
      polygons: options.enableGeometry ? (options.previewPolygon ? 1 : 0) : 0,
      geometryAssigned,
    },
  };
}

export interface SystemScanResult {
  documentId: string;
  systems: ExtractedSystemCode[];
  primarySystem: string | null;
}

/**
 * Scan document text for system codes (tfmrules) with positional sorting
 */
export async function scanDocumentForSystems(documentId: string): Promise<SystemScanResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      projectId: true,
      url: true,
      fileUrl: true,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  const pdfBuffer = await readDocumentPdf(document);
  const { items } = await extractTextFromPDF(pdfBuffer);
  const detectedSystems = findSystemsInText(items);

  // Keep first occurrence (already sorted)
  const systems: ExtractedSystemCode[] = [];
  const seen = new Set<string>();
  for (const system of detectedSystems) {
    if (!seen.has(system.code)) {
      seen.add(system.code);
      systems.push(system);
    }
  }

  return {
    documentId,
    systems,
    primarySystem: systems.length > 0 ? systems[0].code : null,
  };
}

export async function verifyDocumentAgainstMassList(
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

/**
 * Save components to document with all metadata
 */
export async function saveComponentsToDocument(
  documentId: string,
  components: ExtractedComponent[]
): Promise<number> {
  let savedCount = 0;
  logDebug(`Saving ${components.length} components to doc ${documentId}.`);

  if (components.length > 0) {
    logDebug(`First component sample: ${JSON.stringify(components[0])}`);
  }

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
          width: comp.width,
          height: comp.height,
          page: comp.page,
          verifiedByText: comp.verifiedByText || false,
          textConfidence: comp.confidence,
        },
        create: {
          documentId,
          code: comp.code,
          system: comp.system,
          x: comp.x,
          y: comp.y,
          width: comp.width,
          height: comp.height,
          page: comp.page,
          verifiedByText: comp.verifiedByText || false,
          textConfidence: comp.confidence,
        },
      });
      savedCount++;

      // DEBUG: Read back immediately to verify properties
      if (savedCount === 1) {
        const check = await prisma.documentComponent.findUnique({
          where: { documentId_code: { documentId, code: comp.code } }
        });
        logDebug(`IMMEDIATE READBACK: ${JSON.stringify(check)}`);
      }
    } catch (error) {
      logDebug(`Error saving component ${comp.code}: ${error}`);
      console.error(`Error saving component ${comp.code}:`, error);
    }
  }

  logDebug(`Successfully saved ${savedCount} components.`);
  return savedCount;
}

export interface MassListVerificationResult {
  missingInDrawing: MassList[];
  missingInMassList: ParsedComponent[];
  totalScanned: number;
  totalInMassList: number;
}

export function verifyAgainstMassList(
  scanned: ParsedComponent[],
  massList: MassList[]
): MassListVerificationResult {
  const normalize = (val?: string | null) =>
    val ? val.toString().toUpperCase().trim() : "";

  // Build set of all codes from mass list (all variants)
  const massCodes = new Set<string>();
  massList.forEach((m) => {
    const variants = getTFMVariants(m);
    variants.forEach((code) => massCodes.add(code));
  });

  // Build set of scanned codes (normalized)
  const scannedCodes = new Set<string>();
  scanned.forEach((c) => {
    scannedCodes.add(normalize(c.code));
    // Also add system-component combination
    if (c.system) {
      scannedCodes.add(`${normalize(c.system)}-${normalize(c.code)}`);
      scannedCodes.add(`${normalize(c.system)}${normalize(c.code)}`);
    }
  });

  // Find mass list items not found in drawing
  const missingInDrawing = massList.filter((m) => {
    const variants = getTFMVariants(m);
    return !Array.from(variants).some((code) => scannedCodes.has(code));
  });

  // Find scanned items not found in mass list
  const missingInMassList = scanned.filter((c) => {
    const code = normalize(c.code);
    const systemCode = normalize(c.system);

    // Check if any variant matches
    const variants = [
      code,
      `${systemCode}-${code}`,
      `${systemCode}${code}`,
      `=${systemCode}-${code}`,
    ];

    return !variants.some((v) => massCodes.has(v));
  });

  return {
    missingInDrawing,
    missingInMassList,
    totalScanned: scanned.length,
    totalInMassList: massList.length,
  };
}

export function scanDocumentForComponentsSimple(
  content: string,
  systemTags: string[] = []
): { components: ParsedComponent[]; uniqueCount: number } {
  const lines = content.split('\n');
  const components: ParsedComponent[] = [];
  const seen = new Set<string>();

  const defaultSystem = systemTags.length > 0 ? systemTags[0] : undefined;

  // Simple regex patterns for TFM-like codes
  const tfmPattern = /([A-Z]{2,4}\d[0-9A-Z\/_\-]*)/gi;

  for (const line of lines) {
    const matches = line.matchAll(tfmPattern);

    for (const match of matches) {
      const code = match[1];
      const key = `${code}-${defaultSystem || 'NONE'}`;

      if (!seen.has(key)) {
        seen.add(key);
        components.push({
          code,
          system: defaultSystem || null,
          byggnr: null,
          typeCode: null,
          confidence: 0.7,
          matchType: 'default',
        });
      }
    }
  }

  return {
    components,
    uniqueCount: seen.size,
  };
}

export async function scanDocumentForCustomPattern(
  documentId: string,
  pattern: string
): Promise<{ matches: PatternMatch[]; regex: string }> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      projectId: true,
      url: true,
      fileUrl: true,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  const pdfBuffer = await readDocumentPdf(document);
  const { items } = await extractTextFromPDF(pdfBuffer);

  const matches = findMatchesInText(items, pattern);
  const regex = convertPatternToRegex(pattern).source;

  return { matches, regex };
}
