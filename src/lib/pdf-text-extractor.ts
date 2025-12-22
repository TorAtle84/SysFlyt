// CRITICAL: Import polyfills FIRST, before pdfjs-dist
// This file sets up DOMMatrix, ImageData, Path2D for Node.js
import "./canvas-polyfill";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseComponentIds, isLikelyNonComponent } from "./id-pattern";
import type { ParsedComponent } from "./id-pattern";

import path from "path";
import { pathToFileURL } from "url";

import { createRequire } from "module";
import { existsSync, appendFileSync } from "fs";

function logDebug(msg: string) {
  try {
    appendFileSync("server-debug.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    // ignore
  }
}

if (typeof window === "undefined") {
  // Server-side: Node.js environment
  try {
    logDebug(`Initializing PDF Worker. CWD: ${process.cwd()}`);

    // Robust require creation that handles Webpack internal URLs
    const anchor = import.meta.url.startsWith("file:")
      ? import.meta.url
      : "file://" + path.join(process.cwd(), "package.json");

    logDebug(`Anchor URL: ${anchor}`);
    const require = createRequire(anchor);

    // 1. Try resolving via Node resolution algorithm
    try {
      const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
      logDebug(`Resolved worker path via require: ${workerPath}`);
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    } catch (resolveErr) {
      logDebug(`Require resolve failed: ${resolveErr}`);
      throw resolveErr; // Trigger fallback
    }

  } catch (e) {
    logDebug(`Primary setup failed: ${e}`);
    // 2. Fallback to reliable path from project root
    try {
      const rootPath = path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
      logDebug(`Checking root path fallback: ${rootPath}`);
      if (existsSync(rootPath)) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(rootPath).href;
        logDebug(`Used root path fallback.`);
      } else {
        logDebug(`Critical: Could not find PDF worker at ${rootPath}`);
        // Last ditch: minified
        pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.mjs";
      }
    } catch (err) {
      logDebug(`Secondary setup failed: ${err}`);
      console.error("PDF Worker Setup Failed:", err);
    }
  }
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

export interface TextItemWithFontSize extends TextItem {
  fontSize: number;
}

export interface FunctionDescriptionScanResult {
  primarySystem: string | null;
  primarySystemFontSize: number;
  referencedSystems: Array<{
    code: string;
    page: number;
    fontSize: number;
  }>;
  documentTitle: string | null;
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
    // Use pdfjs-dist directly instead of pdf-parse (which has issues)
    const typedArray = new Uint8Array(pdfBuffer);
    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Extract items with position info for intelligent joining
      const items = textContent.items
        .filter((item: any) => 'str' in item && item.str.length > 0)
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0,
        }));

      // Sort by Y (group by line) then X (left to right)
      items.sort((a: any, b: any) => {
        const yDiff = Math.abs(a.y - b.y);
        if (yDiff > 5) return b.y - a.y; // Different lines (PDF Y is bottom-up)
        return a.x - b.x; // Same line, sort by X
      });

      // Join items intelligently:
      // - If items are on same line (Y within 5 units) and close together, join WITHOUT space
      // - This handles cases like "JPA00" + "38" → "JPA0038"
      const lineTexts: string[] = [];
      let currentLine: string[] = [];
      let lastY = -9999;
      let lastEndX = -9999;

      for (const item of items) {
        const yDiff = Math.abs(item.y - lastY);

        if (yDiff > 5) {
          // New line
          if (currentLine.length > 0) {
            lineTexts.push(currentLine.join(''));
          }
          currentLine = [item.str];
          lastY = item.y;
          lastEndX = item.x + item.width;
        } else {
          // Same line - check horizontal gap
          const gap = item.x - lastEndX;

          // If gap is small (<10 units), likely continuation (no space)
          // If gap is moderate (10-50 units), add single space
          // If gap is large (>50 units), might be table column
          if (gap < 10) {
            // Very close - likely split text, join directly
            currentLine.push(item.str);
          } else if (gap < 50) {
            // Normal word spacing
            currentLine.push(' ' + item.str);
          } else {
            // Large gap - likely table cell boundary
            currentLine.push('  ' + item.str);
          }
          lastEndX = item.x + item.width;
        }
      }

      // Don't forget last line
      if (currentLine.length > 0) {
        lineTexts.push(currentLine.join(''));
      }

      textParts.push(lineTexts.join('\n'));
    }

    return textParts.join('\n');
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

  // Match with version: 360.001:02 -> return ONLY 360.001
  const matchVersion = cleaned.match(/^(\d{3,4}\.\d{2,4})/);
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
    logDebug(`Starting PDFJS document loading. Buffer size: ${pdfBuffer.length}`);
    const data = new Uint8Array(pdfBuffer);
    const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
    logDebug(`PDF Loaded. Pages: ${pdf.numPages}`);

    let fullText = "";
    const allItems: TextItem[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      const textContent = await page.getTextContent();

      // Use native page rotation to ensure coordinates match the visual PDF representation. 
      // Auto-detecting orientation can cause coordinate normalization issues if text is vertical (e.g. schematics).
      const rotation = page.rotate || 0;

      const viewport = page.getViewport({ scale: 1.0, rotation });

      for (const item of textContent.items) {
        if ("str" in item && item.str.trim()) {
          const tx = item.transform;

          // Get font height from transform matrix or item.height
          const fontHeight = item.height || Math.abs(tx[3]) || Math.abs(tx[0]) || 10;

          // tx[4], tx[5] is the text BASELINE position in PDF coordinates
          // We need the bounding box: calculate top-left and bottom-right corners

          // Bottom-left corner (at baseline, left edge)
          const pdfX1 = tx[4];
          const pdfY1 = tx[5];

          // Top-right corner (at top of text, right edge)
          const pdfX2 = tx[4] + (item.width || 0);
          const pdfY2 = tx[5] + fontHeight;

          // Transform both corners to viewport coordinates
          const [vpX1, vpY1] = viewport.convertToViewportPoint(pdfX1, pdfY1);
          const [vpX2, vpY2] = viewport.convertToViewportPoint(pdfX2, pdfY2);

          // Calculate bounding box (min/max because text could be rotated)
          const minX = Math.min(vpX1, vpX2);
          const maxX = Math.max(vpX1, vpX2);
          const minY = Math.min(vpY1, vpY2);
          const maxY = Math.max(vpY1, vpY2);

          const widthPx = maxX - minX;
          const heightPx = maxY - minY;

          // Convert to percentage using top-left corner as anchor
          const xPercent = (minX / viewport.width) * 100;
          const yPercent = (minY / viewport.height) * 100;
          const widthPercent = (widthPx / viewport.width) * 100;
          const heightPercent = (heightPx / viewport.height) * 100;

          // Debug logging for troubleshooting
          if (item.str.includes("RTD") || item.str.includes("RTA")) {
            console.log(`[COORD] "${item.str}"`);
            console.log(`  PDF baseline: (${pdfX1.toFixed(1)}, ${pdfY1.toFixed(1)}) size: ${(item.width || 0).toFixed(1)} x ${fontHeight.toFixed(1)}`);
            console.log(`  VP corners: (${vpX1.toFixed(1)}, ${vpY1.toFixed(1)}) to (${vpX2.toFixed(1)}, ${vpY2.toFixed(1)})`);
            console.log(`  VP box: (${minX.toFixed(1)}, ${minY.toFixed(1)}) size: ${widthPx.toFixed(1)} x ${heightPx.toFixed(1)}`);
            console.log(`  Percent: (${xPercent.toFixed(1)}%, ${yPercent.toFixed(1)}%) size: ${widthPercent.toFixed(1)}% x ${heightPercent.toFixed(1)}%`);
          }

          allItems.push({
            text: item.str,
            x: xPercent,
            y: yPercent,
            width: widthPercent > 0 ? widthPercent : 2,
            height: heightPercent > 0 ? heightPercent : 1,
            page: pageNum,
          });

          fullText += item.str + " ";
        }
      }

      fullText += "\n";
    }

    logDebug(`Extraction success. Items: ${allItems.length}`);
    return { text: fullText, items: allItems };
  } catch (error) {
    logDebug(`Extraction Error: ${error}`);
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

  // Helper to check match and return precise coordinates
  const checkItemForMatch = (item: TextItem, pattern: string, confidence: number) => {
    const rawText = item.text.toUpperCase(); // Preserve original length/spaces for index calculation
    const normalizedPattern = pattern.toUpperCase().trim();

    // Use raw index to handle leading spaces in item text correctly
    const idx = rawText.indexOf(normalizedPattern);

    if (idx !== -1) {
      // Calculate precise coordinates using character width approximation
      const charWidth = item.width / item.text.length;
      const preciseX = item.x + (idx * charWidth);
      const preciseWidth = normalizedPattern.length * charWidth;

      return {
        x: preciseX,
        y: item.y,
        width: preciseWidth > 0 ? preciseWidth : item.width,
        height: item.height,
        page: item.page,
        verifiedByText: true,
        matchedText: pattern,
        confidenceScore: confidence,
      };
    }
    return null;
  };

  // Try each pattern in priority order - search nearby first
  for (const { pattern, confidence } of searchPatterns) {
    // Search in nearby items first
    for (const item of nearbyItems) {
      const match = checkItemForMatch(item, pattern, confidence);
      if (match) return match;
    }
  }

  // Fallback: Search entire page if not found nearby
  const pageItems = allItems.filter(item => item.page === initialPosition.page);

  for (const { pattern, confidence } of searchPatterns) {
    // Search remaining buffer
    for (const item of pageItems) {
      const match = checkItemForMatch(item, pattern, confidence * 0.8);
      if (match) return match;
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
    /(?:\+(?<byggnr>[A-Za-z0-9]+)\s*=)?\s*=?\s*(?<system>\d{3,4}\.\d{2,4})/gi;

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
  const systemPattern = /\d{3,4}\.\d{2,4}/g;
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
    const { items, text } = await extractTextFromPDF(pdfBuffer);
    console.log(`[EXTRACT] Extracted ${items.length} text items from ${filename}`);
    console.log(`[EXTRACT] First 200 chars: ${text.substring(0, 200)}`);
    console.log(`[EXTRACT] Full text length: ${text.length}`);

    const components = findComponentsInText(items);
    console.log(`[EXTRACT] Found ${components.length} components`);

    for (const comp of components) {
      if (comp.system) {
        systemCodes.add(comp.system);
      }
    }
  } catch (error) {
    console.error("Error extracting system codes from PDF:", error);
  }

  const result = Array.from(systemCodes);
  console.log(`[EXTRACT] Final system codes: ${result.join(", ")}`);
  return result;
}

/**
 * Convert user-friendly pattern to RegExp
 * Supports * as wildcard
 */
export function convertPatternToRegex(pattern: string): RegExp {
  // Escape special regex chars except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with .* (or more specific char class if desired)
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp(regexStr, 'gi');
}

export interface PatternMatch {
  code: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  context: string;
}

/**
 * Find matches for a custom pattern in text items
 * Table-aware: handles varying Y-coords and text spanning multiple items
 */
export function findMatchesInText(items: TextItem[], pattern: string | RegExp): PatternMatch[] {
  const regex = typeof pattern === 'string' ? convertPatternToRegex(pattern) : pattern;

  // Group by page
  const pageGroups = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!pageGroups.has(item.page)) {
      pageGroups.set(item.page, []);
    }
    pageGroups.get(item.page)!.push(item);
  }

  const matches: PatternMatch[] = [];
  const seen = new Set<string>();

  // Table-aware threshold: 8px allows for minor row height variations in tables
  const Y_THRESHOLD = 8;

  for (const [pageNum, pageItems] of pageGroups) {
    // Sort by Y then X
    const sortedItems = [...pageItems].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > Y_THRESHOLD) return yDiff;
      return a.x - b.x;
    });

    // Cluster into lines with increased threshold for table tolerance
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [];
    let lastY = -999;

    for (const item of sortedItems) {
      if (Math.abs(item.y - lastY) > Y_THRESHOLD) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [item];
        lastY = item.y;
      } else {
        currentLine.push(item);
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // Search lines
    for (const lineItems of lines) {
      lineItems.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(" ");

      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        const fullMatch = match[0];
        if (!fullMatch.trim()) continue;

        // Find ALL items that contain this match (for spanning text)
        // Build position mapping with item indices
        const itemPositions: Array<{ item: TextItem; startPos: number; endPos: number }> = [];
        let currentPos = 0;

        for (const item of lineItems) {
          const itemLen = item.text.length;
          itemPositions.push({
            item,
            startPos: currentPos,
            endPos: currentPos + itemLen
          });
          currentPos += itemLen + 1; // +1 for space
        }

        const matchStart = match.index;
        const matchEnd = match.index + fullMatch.length;

        // Find items that overlap with the match
        const overlappingItems = itemPositions.filter(ip =>
          // Item overlaps if: item starts before match ends AND item ends after match starts
          ip.startPos < matchEnd && ip.endPos > matchStart
        );

        if (overlappingItems.length === 0) {
          // Fallback to first item
          overlappingItems.push(itemPositions[0]);
        }

        // Calculate bounding box encompassing all overlapping items
        const firstItem = overlappingItems[0].item;
        const lastItem = overlappingItems[overlappingItems.length - 1].item;

        // Calculate precise X start position within first item
        const offsetInFirstItem = Math.max(0, matchStart - overlappingItems[0].startPos);
        const firstItemCharWidth = firstItem.text.length > 0 ? firstItem.width / firstItem.text.length : 6;
        const preciseX = firstItem.x + (offsetInFirstItem * firstItemCharWidth);

        // Calculate width: from preciseX to end of last overlapping item
        // (Or more precisely, to match end position within last item)
        let preciseWidth: number;
        if (overlappingItems.length === 1) {
          // Single item: use character-based width
          preciseWidth = fullMatch.length * firstItemCharWidth;
        } else {
          // Spanning: from start X to end of last item
          const lastItemEnd = lastItem.x + lastItem.width;
          preciseWidth = lastItemEnd - preciseX;
        }

        // Use average Y if spanning items have different Y
        const avgY = overlappingItems.reduce((sum, ip) => sum + ip.item.y, 0) / overlappingItems.length;
        // Use max height of overlapping items
        const maxHeight = Math.max(...overlappingItems.map(ip => ip.item.height));

        const key = `${fullMatch}-${pageNum}-${preciseX.toFixed(1)}-${avgY.toFixed(1)}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            code: fullMatch,
            page: pageNum,
            x: preciseX,
            y: avgY,
            width: preciseWidth > 0 ? preciseWidth : firstItem.width,
            height: maxHeight,
            context: lineText,
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Scan a function description PDF for system codes
 * Primary system is identified by largest font size on pages 1-5
 * All other system codes are returned as referenced systems
 */
export async function scanFunctionDescription(
  pdfBuffer: Buffer,
  filename: string
): Promise<FunctionDescriptionScanResult> {
  const systemPattern = /\b(\d{3,4}\.\d{2,4})\b/g;

  // Extract title from filename
  const documentTitle = filename.replace(/\.pdf$/i, "").trim();

  // Find system in filename as fallback
  const filenameMatch = filename.match(/\b(\d{3,4}\.\d{2,4})\b/);
  const filenamePrimarySystem = filenameMatch ? filenameMatch[1] : null;

  try {
    const data = new Uint8Array(pdfBuffer);
    const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

    interface SystemMatch {
      code: string;
      page: number;
      fontSize: number;
    }

    const allMatches: SystemMatch[] = [];

    // Process first 5 pages (or all if less)
    const pagesToScan = Math.min(pdf.numPages, 5);

    for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if ("str" in item && item.str.trim()) {
          const tx = item.transform;
          // Font size from transform matrix
          const fontSize = Math.abs(tx[0]) || Math.abs(tx[3]) || 12;

          // Find system codes in this text item
          const text = item.str;
          let match;
          while ((match = systemPattern.exec(text)) !== null) {
            allMatches.push({
              code: match[1],
              page: pageNum,
              fontSize,
            });
          }
        }
      }
    }

    // Also scan remaining pages for referenced systems (with default font size)
    for (let pageNum = pagesToScan + 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if ("str" in item && item.str.trim()) {
          const tx = item.transform;
          const fontSize = Math.abs(tx[0]) || Math.abs(tx[3]) || 12;

          const text = item.str;
          let match;
          while ((match = systemPattern.exec(text)) !== null) {
            allMatches.push({
              code: match[1],
              page: pageNum,
              fontSize,
            });
          }
        }
      }
    }

    if (allMatches.length === 0) {
      return {
        primarySystem: filenamePrimarySystem,
        primarySystemFontSize: 0,
        referencedSystems: [],
        documentTitle,
      };
    }

    // Find primary system: largest font on pages 1-5
    const first5PagesMatches = allMatches.filter(m => m.page <= 5);
    const sortedByFontSize = [...first5PagesMatches].sort((a, b) => b.fontSize - a.fontSize);

    const primaryMatch = sortedByFontSize[0];
    const primarySystem = primaryMatch?.code || filenamePrimarySystem;
    const primarySystemFontSize = primaryMatch?.fontSize || 0;

    // Get unique referenced systems (excluding primary)
    const seen = new Set<string>();
    if (primarySystem) seen.add(primarySystem);

    const referencedSystems: Array<{ code: string; page: number; fontSize: number }> = [];

    for (const match of allMatches) {
      if (!seen.has(match.code)) {
        seen.add(match.code);
        referencedSystems.push({
          code: match.code,
          page: match.page,
          fontSize: match.fontSize,
        });
      }
    }

    // Sort by page then fontSize
    referencedSystems.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return b.fontSize - a.fontSize;
    });

    return {
      primarySystem,
      primarySystemFontSize,
      referencedSystems,
      documentTitle,
    };

  } catch (error) {
    console.error("Error scanning function description:", error);
    return {
      primarySystem: filenamePrimarySystem,
      primarySystemFontSize: 0,
      referencedSystems: [],
      documentTitle,
    };
  }
}
