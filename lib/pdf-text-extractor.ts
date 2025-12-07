import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseComponentIds, isLikelyNonComponent } from "./id-pattern";
import type { ParsedComponent } from "./id-pattern";

if (typeof window === "undefined") {
  // Server-side: disable worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";
} else {
  // Client-side: use worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ExtractedComponent {
  code: string;
  system: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  confidence: number;
  verifiedByText?: boolean;
}

export interface ExtractedSystemCode {
  code: string;
  byggnr: string | null;
  page: number;
  x: number;
  y: number;
  context: string;
}

interface OrientationAnalysis {
  rotation: number;
  confidence: number;
  counts: {
    horizontal: number;
    vertical90: number;
    vertical270: number;
    upsideDown: number;
  };
}

function detectPDFOrientation(textContent: any): OrientationAnalysis {
  const items = textContent.items.filter(
    (item: any) => "str" in item && item.str.trim().length > 0
  );

  if (items.length === 0) {
    return {
      rotation: 0,
      confidence: 0,
      counts: { horizontal: 0, vertical90: 0, vertical270: 0, upsideDown: 0 },
    };
  }

  let horizontal = 0;
  let vertical90 = 0;
  let vertical270 = 0;
  let upsideDown = 0;

  items.forEach((item: any) => {
    const [a, b, c, d] = item.transform;
    const absA = Math.abs(a);
    const absB = Math.abs(b);
    const absC = Math.abs(c);
    const absD = Math.abs(d);

    if (absA > absB && absD > absC) {
      if (a > 0 && d > 0) horizontal++;
      else if (a < 0 && d < 0) upsideDown++;
    } else if (absB > absA && absC > absD) {
      if (b > 0 && c < 0) vertical90++;
      else if (b < 0 && c > 0) vertical270++;
    }
  });

  const total = horizontal + vertical90 + vertical270 + upsideDown;
  const results = [
    { rotation: 0, count: horizontal },
    { rotation: 90, count: vertical90 },
    { rotation: 180, count: upsideDown },
    { rotation: 270, count: vertical270 },
  ];

  const dominant = results.reduce((max, curr) =>
    curr.count > max.count ? curr : max
  );
  const confidence = total > 0 ? dominant.count / total : 0;

  return {
    rotation: dominant.rotation,
    confidence,
    counts: { horizontal, vertical90, vertical270, upsideDown },
  };
}

export async function extractPlainTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")) as {
      default: (data: Buffer) => Promise<{ text: string }>;
    };
    const res = await pdfParse.default(pdfBuffer);
    return res?.text || "";
  } catch (error) {
    console.error("Error extracting plain text from PDF:", error);
    return "";
  }
}

/**
 * Extract system tags directly from raw text
 * Mirrors legacy Base/tag-parser rules
 */
export function parseSystemTagsFromText(text: string): string[] {
  const tags = new Set<string>();

  // Rule 1: TFM Style (+Bygg=System-Component%Type) → capture system
  const tfmRegex = /\+(\w+)=([\d]+\.[\d]+)-/g;
  let match;
  while ((match = tfmRegex.exec(text)) !== null) {
    if (match[2]) tags.add(match[2]);
  }

  // Rule 2: System-Component (360.001-RT401) → capture system
  const systemComponentRegex = /([\d]{3,4}(?:\.[\d]+)+)-([A-Za-z]{2,4}[\d]+)/g;
  while ((match = systemComponentRegex.exec(text)) !== null) {
    if (match[1]) tags.add(match[1]);
  }

  // Rule 3: Standalone system codes (3-7xx prefix)
  const standaloneSystemRegex = /\b([3-7][\d]{2,3}\.[\d]+)\b/g;
  while ((match = standaloneSystemRegex.exec(text)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

/**
 * Extract system code from text/filename
 */
export function extractSystemCode(text: string): string | null {
  const cleaned = text.trim().toUpperCase();

  // Match 3-digit system: 360.001
  const match3digit = cleaned.match(/^(\d{3})\.\d{2,4}/);
  if (match3digit) return match3digit[0]; // Return full "360.001"

  // Match 4-digit system: 5640.001
  const match4digit = cleaned.match(/^(\d{4})\.\d{2,4}/);
  if (match4digit) return match4digit[0]; // Return full "5640.001"

  // Match with version: 360.001:02
  const matchVersion = cleaned.match(/^(\d{3,4}\.\d{2,4}:\d+)/);
  if (matchVersion) return matchVersion[1];

  return null;
}

/**
 * Extract text with accurate coordinates from PDF
 * Implements proper rotation detection and Y-axis adjustment
 */
export async function extractTextFromPDF(
  pdfBuffer: Buffer
): Promise<{ text: string; items: TextItem[] }> {
  try {
    const data = new Uint8Array(pdfBuffer);
    const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

    let fullText = "";
    const allItems: TextItem[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      const textContent = await page.getTextContent();
      const orientation = detectPDFOrientation(textContent);
      const rotation =
        orientation.confidence >= 0.6 ? orientation.rotation : page.rotate || 0;

      const viewport = page.getViewport({ scale: 1.0, rotation });

      for (const item of textContent.items) {
        if ("str" in item && item.str.trim()) {
          const tx = item.transform;

          const fontHeight = item.height || 0;
          const transformPoint = (px: number, py: number) => {
            const pdfX = tx[0] * px + tx[2] * py + tx[4];
            const pdfY = tx[1] * px + tx[3] * py + tx[5];
            return viewport.convertToViewportPoint(pdfX, pdfY);
          };

          const corners = [
            transformPoint(0, 0),
            transformPoint(item.width, 0),
            transformPoint(item.width, fontHeight),
            transformPoint(0, fontHeight),
          ];

          const xs = corners.map((c) => c[0]);
          const ys = corners.map((c) => c[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          const widthPx = maxX - minX;
          const heightPx = maxY - minY;

          const centerX = minX + widthPx / 2;
          const centerY = minY + heightPx * 0.6;

          const xPercent = (centerX / viewport.width) * 100;
          const yPercent = (centerY / viewport.height) * 100;
          const widthPercent = (widthPx / viewport.width) * 100;
          const heightPercent = (heightPx / viewport.height) * 100;

          allItems.push({
            text: item.str,
            x: xPercent,
            y: yPercent,
            width: widthPercent,
            height: heightPercent,
            page: pageNum,
          });

          fullText += item.str + " ";
        }
      }

      fullText += "\n";
    }

    return { text: fullText, items: allItems };
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    return { text: "", items: [] };
  }
}

/**
 * Verify component position by searching for unique text match
 * If component code appears exactly once in text, use those coordinates
 * This corrects any positional discrepancies from initial detection
 */
export function verifyComponentPosition(
  componentCode: string,
  initialPosition: { x: number; y: number; width: number; height: number; page: number },
  allItems: TextItem[],
  systemCode?: string | null
): { x: number; y: number; width: number; height: number; page: number; verifiedByText: boolean; matchedText?: string; confidenceScore?: number } {

  // Build prioritized search patterns
  const searchPatterns: Array<{ pattern: string; confidence: number; type: string }> = [];

  // Priority 1: System + Component (most specific)
  if (systemCode) {
    searchPatterns.push(
      { pattern: `${systemCode}-${componentCode}`, confidence: 0.95, type: 'system-component-dash' },
      { pattern: `${systemCode} ${componentCode}`, confidence: 0.90, type: 'system-component-space' }
    );
  }

  // Priority 2: Just component code
  searchPatterns.push(
    { pattern: componentCode, confidence: 0.75, type: 'component-only' }
  );

  // Search radius for "nearby" matches (percentage-based)
  const searchRadius = { x: 20, y: 10 }; // 20% horizontal, 10% vertical

  // Filter to nearby items first (better performance and accuracy)
  const nearbyItems = allItems.filter(item =>
    item.page === initialPosition.page &&
    Math.abs(item.x - initialPosition.x) <= searchRadius.x &&
    Math.abs(item.y - initialPosition.y) <= searchRadius.y
  );

  // Try each pattern in priority order - search nearby first
  for (const { pattern, confidence } of searchPatterns) {
    const normalizedPattern = pattern.toUpperCase().trim();

    // Search in nearby items first
    for (const item of nearbyItems) {
      const normalizedText = item.text.toUpperCase().trim();

      if (normalizedText.includes(normalizedPattern)) {
        return {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          page: item.page,
          verifiedByText: true,
          matchedText: pattern,
          confidenceScore: confidence,
        };
      }
    }
  }

  // Fallback: Search entire page if not found nearby
  const pageItems = allItems.filter(item => item.page === initialPosition.page);

  for (const { pattern, confidence } of searchPatterns) {
    const normalizedPattern = pattern.toUpperCase().trim();

    for (const item of pageItems) {
      const normalizedText = item.text.toUpperCase().trim();

      if (normalizedText.includes(normalizedPattern)) {
        // Found on page but not nearby - lower confidence
        return {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          page: item.page,
          verifiedByText: true,
          matchedText: pattern,
          confidenceScore: confidence * 0.8, // Reduce confidence by 20%
        };
      }
    }
  }

  // No match found - keep original position
  return {
    ...initialPosition,
    verifiedByText: false,
    confidenceScore: 0.5,
  };
}

/**
 * Find components in text items using state machine parsing
 * Groups items by page and line for context-aware parsing
 * With text verification: searches for unique match to correct position
 */
export function findComponentsInText(
  items: TextItem[],
  defaultSystem?: string
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const seen = new Set<string>();

  // Group by page
  const pageGroups = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!pageGroups.has(item.page)) {
      pageGroups.set(item.page, []);
    }
    pageGroups.get(item.page)!.push(item);
  }

  // Process each page
  for (const [pageNum, pageItems] of pageGroups) {
    // Sort by Y (top to bottom), then X (left to right)
    const sortedItems = [...pageItems].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 3) return yDiff; // 3% tolerance for same line
      return a.x - b.x;
    });

    // Cluster into lines (Y-tolerance: 3%)
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [];
    let lastY = -999;

    for (const item of sortedItems) {
      if (Math.abs(item.y - lastY) > 3) {
        // New line
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        lastY = item.y;
      } else {
        // Same line
        currentLine.push(item);
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Reconstruct text per line
    const lineTexts: string[] = [];
    const lineItemMaps: Map<number, TextItem[]> = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Sort by X
      line.sort((a, b) => a.x - b.x);

      // Merge adjacent items (X-gap < 15%)
      const mergedText = line.map((item) => item.text).join(' ');
      lineTexts.push(mergedText);
      lineItemMaps.set(i, line);
    }

    // Parse components using state machine
    const fullText = lineTexts.join('\n');
    const parsedComponents = parseComponentIds(fullText, defaultSystem);

    // Map parsed components back to coordinates
    for (const parsed of parsedComponents) {
      // Find which line contains this component
      let foundItem: TextItem | null = null;

      for (let lineIdx = 0; lineIdx < lineTexts.length; lineIdx++) {
        const lineText = lineTexts[lineIdx];
        if (lineText.includes(parsed.code)) {
          const lineItems = lineItemMaps.get(lineIdx) || [];

          // Find the specific item that contains the component code
          for (const item of lineItems) {
            if (item.text.includes(parsed.code)) {
              foundItem = item;
              break;
            }
          }

          // If not found in a single item, use first item of line
          if (!foundItem && lineItems.length > 0) {
            foundItem = lineItems[0];
          }

          break;
        }
      }

      if (!foundItem) {
        // Fallback: use first item on page
        foundItem = sortedItems[0];
      }

      const key = `${parsed.code}-${pageNum}`;

      if (!seen.has(key) && !isLikelyNonComponent(parsed.code)) {
        seen.add(key);

        // STEP 1: Initial position from parsing
        const initialPosition = {
          x: foundItem.x,
          y: foundItem.y,
          width: foundItem.width,
          height: foundItem.height,
          page: pageNum,
        };

        // STEP 2: Verify and correct position using text search
        const verifiedPosition = verifyComponentPosition(
          parsed.code,
          initialPosition,
          items, // Search in ALL items, not just page items
          parsed.system // Pass system code for better matching
        );

        components.push({
          code: parsed.code,
          system: parsed.system,
          x: verifiedPosition.x,
          y: verifiedPosition.y,
          width: verifiedPosition.width,
          height: verifiedPosition.height,
          page: pageNum,
          confidence: verifiedPosition.confidenceScore || parsed.confidence,
          verifiedByText: verifiedPosition.verifiedByText,
        });
      }
    }
  }

  // Log verification statistics
  const totalComponents = components.length;
  const verifiedComponents = components.filter(c => c.verifiedByText).length;
  const verificationRate = totalComponents > 0 ? (verifiedComponents / totalComponents * 100).toFixed(1) : '0.0';

  console.log(`✅ Component Verification Statistics:`);
  console.log(`   Total components found: ${totalComponents}`);
  console.log(`   Verified via text search: ${verifiedComponents} (${verificationRate}%)`);
  console.log(`   Not verified: ${totalComponents - verifiedComponents}`);

  return components;
}

/**
 * Find system codes in text items with positional context (tfmrules)
 * Returns unique systems sorted by page (asc) then Y (top-down)
 */
export function findSystemsInText(items: TextItem[]): ExtractedSystemCode[] {
  const systemPattern =
    /(?:\+(?<byggnr>[A-Za-z0-9]+)\s*=)?\s*=?\s*(?<system>\d{3,4}\.\d{2,4}(?::\d{2,4})?)/gi;

  // Group by page
  const pageGroups = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!pageGroups.has(item.page)) {
      pageGroups.set(item.page, []);
    }
    pageGroups.get(item.page)!.push(item);
  }

  const bestByCode = new Map<string, ExtractedSystemCode>();

  for (const [pageNum, pageItems] of pageGroups) {
    // Sort by Y then X to reconstruct lines
    const sortedItems = [...pageItems].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.x - b.x;
    });

    // Cluster into lines
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [];
    let lastY = -999;

    for (const item of sortedItems) {
      if (Math.abs(item.y - lastY) > 3) {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        lastY = item.y;
      } else {
        currentLine.push(item);
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Parse each line for system codes
    for (const lineItems of lines) {
      // Order by X for deterministic matching
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(" ");

      systemPattern.lastIndex = 0;
      let match;
      while ((match = systemPattern.exec(lineText)) !== null) {
        const systemCode = match.groups?.system;
        const byggnr = match.groups?.byggnr || null;

        if (!systemCode) continue;

        // Find anchor item containing the system code, fallback to first in line
        const anchor =
          lineItems.find((item) => item.text.includes(systemCode)) ||
          lineItems[0];

        const candidate: ExtractedSystemCode = {
          code: systemCode,
          byggnr,
          page: pageNum,
          x: anchor?.x ?? 0,
          y: anchor?.y ?? 0,
          context: lineText.trim(),
        };

        const existing = bestByCode.get(systemCode);
        const isHigher =
          !existing ||
          candidate.page < existing.page ||
          (candidate.page === existing.page && candidate.y < existing.y);

        if (isHigher) {
          bestByCode.set(systemCode, candidate);
        }
      }
    }
  }

  return Array.from(bestByCode.values()).sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.y - b.y) > 1e-3) return a.y - b.y;
    return a.x - b.x;
  });
}

/**
 * Find system codes in filename
 */
export function findSystemCodesInFilename(filename: string): string[] {
  const systems: string[] = [];
  const seen = new Set<string>();

  // Match full system codes: 360.001, 5640.0001, etc.
  const systemPattern = /\d{3,4}\.\d{2,4}(?::\d+)?/g;
  let match;

  while ((match = systemPattern.exec(filename)) !== null) {
    const system = match[0];
    if (!seen.has(system)) {
      seen.add(system);
      systems.push(system);
    }
  }

  return systems;
}

export async function extractSystemCodesFromPDF(
  pdfBuffer: Buffer,
  filename: string
): Promise<string[]> {
  const systemCodes = new Set<string>();
  
  const filenameMatches = findSystemCodesInFilename(filename);
  filenameMatches.forEach((s) => systemCodes.add(s));
  
  try {
    const { items } = await extractTextFromPDF(pdfBuffer);
    const components = findComponentsInText(items);
    
    for (const comp of components) {
      if (comp.system) {
        systemCodes.add(comp.system);
      }
    }
  } catch (error) {
    console.error("Error extracting system codes from PDF:", error);
  }
  
  return Array.from(systemCodes);
}
