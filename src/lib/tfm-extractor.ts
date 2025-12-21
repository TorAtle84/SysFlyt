/**
 * TFM Extractor - Parse TFM codes from PDF, Word, and Excel files
 * TFM structure: {Byggnr}{System}{Komponent}{Typekode}
 */

import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractPlainTextFromPDF } from "./pdf-text-extractor";

export interface TfmSegmentConfig {
    byggnr: boolean;
    system: boolean;
    komponent: boolean;
    typekode: boolean;
}

export interface ExtractedTfm {
    fullMatch: string;
    byggnr: string | null;
    system: string | null;
    komponent: string | null;
    typekode: string | null;
    sourceDocument: string;
}

export interface TfmExtractionResult {
    fileName: string;
    tfmEntries: ExtractedTfm[];
    error?: string;
}

// TFM parsing regex based on tfmrules.md
// Pattern: +{byggnr}={system}-{komponent}%{typekode}
const TFM_PATTERN = new RegExp(
    "(?:\\+(?<byggnr>\\d+))?" +              // Optional: +digits for byggnr
    "(?:=)?(?<system>\\d{3,4}\\.\\d{2,4}(?::\\d{2,4})?)" + // System: 3-4 digits.2-4 digits, optional :2-4 digits
    "(?:-)?(?<komponent>[A-Za-z]{2,3}[A-Za-z0-9/_\\-]+)?" + // Component: 2-3 letters followed by alphanumeric
    "(?:%(?<typekode>[A-Za-z]{2,3}))?",      // Optional: %2-3 letters for typekode
    "gi"
);

// Alternative simpler pattern for standalone components
const COMPONENT_PATTERN = /([A-Z]{2,3}\d{1,6}[A-Z0-9/_-]*)/gi;

// System pattern alone
const SYSTEM_PATTERN = /(\d{3,4}\.\d{2,4}(?::\d{2,4})?)/g;

/**
 * Extract text content from a Word document (.docx)
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string> {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } catch (error) {
        console.error("Error extracting text from Word:", error);
        throw new Error("Could not read Word document");
    }
}

/**
 * Extract text content from an Excel file (.xlsx)
 */
export function extractTextFromExcel(buffer: Buffer): string {
    try {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const allText: string[] = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            // Convert to array of arrays and join all cells
            const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
                header: 1,
                defval: ""
            });

            for (const row of data) {
                if (Array.isArray(row)) {
                    const rowText = row.map(cell => String(cell ?? "")).join(" ");
                    if (rowText.trim()) {
                        allText.push(rowText);
                    }
                }
            }
        }

        return allText.join("\n");
    } catch (error) {
        console.error("Error extracting text from Excel:", error);
        throw new Error("Could not read Excel document");
    }
}

/**
 * Extract text from a file buffer based on file type
 */
export async function extractTextFromFile(
    buffer: Buffer,
    fileName: string
): Promise<string> {
    const extension = fileName.toLowerCase().split(".").pop();

    switch (extension) {
        case "pdf":
            return extractPlainTextFromPDF(buffer);
        case "docx":
        case "doc":
            return extractTextFromWord(buffer);
        case "xlsx":
        case "xls":
            return extractTextFromExcel(buffer);
        default:
            throw new Error(`Unsupported file type: ${extension}`);
    }
}

/**
 * Parse TFM entries from text content based on segment configuration
 */
export function parseTfmFromText(
    text: string,
    fileName: string,
    config: TfmSegmentConfig
): ExtractedTfm[] {
    const entries: ExtractedTfm[] = [];
    const seen = new Set<string>();

    // Helper to add entry if not seen
    const addEntry = (entry: ExtractedTfm) => {
        if (!seen.has(entry.fullMatch)) {
            seen.add(entry.fullMatch);
            entries.push(entry);
        }
    };

    // If ONLY KOMPONENT is selected (no system), use the simple component pattern
    if (config.komponent && !config.system && !config.byggnr && !config.typekode) {
        let match;
        COMPONENT_PATTERN.lastIndex = 0;
        while ((match = COMPONENT_PATTERN.exec(text)) !== null) {
            const komponent = match[1];
            // Filter out obvious non-components (too short, just letters, etc)
            if (komponent.length < 4) continue;
            if (!/\d/.test(komponent)) continue; // Must have at least one digit
            if (/^\d+$/.test(komponent)) continue; // Must not be only digits

            addEntry({
                fullMatch: komponent,
                byggnr: null,
                system: null,
                komponent,
                typekode: null,
                sourceDocument: fileName,
            });
        }
        return entries;
    }

    // If SYSTEM is included, try full TFM pattern first
    if (config.system) {
        TFM_PATTERN.lastIndex = 0;
        let match;
        while ((match = TFM_PATTERN.exec(text)) !== null) {
            const groups = match.groups || {};
            const byggnr = groups.byggnr || null;
            const system = groups.system || null;
            const komponent = groups.komponent || null;
            const typekode = groups.typekode || null;

            // Skip if system is required but not found
            if (!system) continue;

            // Build the key based on selected segments
            const keyParts: string[] = [];
            if (config.byggnr && byggnr) keyParts.push(`+${byggnr}`);
            if (config.system && system) keyParts.push(`=${system}`);
            if (config.komponent && komponent) keyParts.push(`-${komponent}`);
            if (config.typekode && typekode) keyParts.push(`%${typekode}`);

            // Skip if required segments missing
            if (config.komponent && !komponent) continue;
            if (keyParts.length === 0) continue;

            addEntry({
                fullMatch: keyParts.join(""),
                byggnr: config.byggnr ? byggnr : null,
                system: config.system ? system : null,
                komponent: config.komponent ? komponent : null,
                typekode: config.typekode ? typekode : null,
                sourceDocument: fileName,
            });
        }

        // If still no matches and system only, try system pattern
        if (entries.length === 0 && !config.komponent) {
            SYSTEM_PATTERN.lastIndex = 0;
            let match;
            while ((match = SYSTEM_PATTERN.exec(text)) !== null) {
                const system = match[1];
                addEntry({
                    fullMatch: `=${system}`,
                    byggnr: null,
                    system,
                    komponent: null,
                    typekode: null,
                    sourceDocument: fileName,
                });
            }
        }
    }

    // If ONLY SYSTEM is selected with KOMPONENT, but TFM pattern found nothing,
    // try extracting system and components separately
    if (entries.length === 0 && config.system && config.komponent) {
        // First find unique systems
        const systems = new Set<string>();
        SYSTEM_PATTERN.lastIndex = 0;
        let match;
        while ((match = SYSTEM_PATTERN.exec(text)) !== null) {
            systems.add(match[1]);
        }

        // Then find components
        COMPONENT_PATTERN.lastIndex = 0;
        while ((match = COMPONENT_PATTERN.exec(text)) !== null) {
            const komponent = match[1];
            if (komponent.length < 4) continue;
            if (!/\d/.test(komponent)) continue;
            if (/^\d+$/.test(komponent)) continue;

            // Associate with first system found (if any)
            const system = systems.size > 0 ? [...systems][0] : null;
            const key = system ? `=${system}-${komponent}` : `-${komponent}`;

            addEntry({
                fullMatch: key,
                byggnr: null,
                system,
                komponent,
                typekode: null,
                sourceDocument: fileName,
            });
        }
    }

    return entries;
}

/**
 * Compare TFM entries across multiple documents
 */
export interface ComparisonResult {
    tfm: string;
    sourceDocuments: string[]; // List of documents where this TFM was found
    presence: Map<string, boolean>; // fileName -> present
}

export interface ComparisonMatrix {
    tfmEntries: ComparisonResult[];
    fileNames: string[];
    mainFileName: string;
}

export function compareTfmEntries(
    mainFile: TfmExtractionResult,
    comparisonFiles: TfmExtractionResult[]
): ComparisonMatrix {
    const allFiles = [mainFile, ...comparisonFiles];
    const fileNames = allFiles.map(f => f.fileName);

    // Collect all unique TFM codes
    const allTfmCodes = new Map<string, Set<string>>();

    for (const file of allFiles) {
        for (const entry of file.tfmEntries) {
            if (!allTfmCodes.has(entry.fullMatch)) {
                allTfmCodes.set(entry.fullMatch, new Set());
            }
            allTfmCodes.get(entry.fullMatch)!.add(file.fileName);
        }
    }

    // Build comparison results
    const results: ComparisonResult[] = [];

    for (const [tfm, sources] of allTfmCodes) {
        const presence = new Map<string, boolean>();
        for (const fileName of fileNames) {
            presence.set(fileName, sources.has(fileName));
        }

        results.push({
            tfm,
            sourceDocuments: Array.from(sources),
            presence,
        });
    }

    // Sort by TFM code
    results.sort((a, b) => a.tfm.localeCompare(b.tfm));

    return {
        tfmEntries: results,
        fileNames,
        mainFileName: mainFile.fileName,
    };
}

/**
 * Full extraction pipeline for a single file
 */
export async function extractTfmFromFile(
    buffer: Buffer,
    fileName: string,
    config: TfmSegmentConfig
): Promise<TfmExtractionResult> {
    try {
        const text = await extractTextFromFile(buffer, fileName);
        const tfmEntries = parseTfmFromText(text, fileName, config);

        return {
            fileName,
            tfmEntries,
        };
    } catch (error) {
        return {
            fileName,
            tfmEntries: [],
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
