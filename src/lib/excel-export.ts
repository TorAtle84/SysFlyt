/**
 * Excel Export Utility for TFM Comparison
 * Creates Excel files with formatting, colors, and auto-filters
 */

import * as XLSX from "xlsx";
import type { ComparisonMatrix } from "./tfm-extractor";

// Pastel colors for Excel cells
const COLORS = {
    present: "D4EDDA",    // Light green
    missing: "F8D7DA",    // Light red
    header: "E9ECEF",     // Light gray
};

interface ExcelCell {
    v: string | number;    // Value
    t?: "s" | "n";         // Type: string or number
    s?: {
        fill?: { fgColor: { rgb: string } };
        font?: { bold?: boolean };
        alignment?: { horizontal?: string };
    };
}

/**
 * Generate Excel workbook from comparison matrix
 */
export function generateComparisonExcel(
    matrix: ComparisonMatrix,
    comparisonName: string
): Buffer {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create header row
    const headers = ["TFM", "Kilder", ...matrix.fileNames];

    // Create data rows
    const rows: (string | number)[][] = [];

    // Add header row
    rows.push(headers);

    // Add data rows
    for (const entry of matrix.tfmEntries) {
        const row: (string | number)[] = [
            entry.tfm,
            entry.sourceDocuments.join("\n"),
        ];

        // Add presence/absence for each file
        for (const fileName of matrix.fileNames) {
            const isPresent = entry.presence.get(fileName) ?? false;
            row.push(isPresent ? "Tilstede" : "Mangler");
        }

        rows.push(row);
    }

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    const colWidths = [
        { wch: 30 },  // TFM
        { wch: 40 },  // Kilder
        ...matrix.fileNames.map(() => ({ wch: 25 })),
    ];
    ws["!cols"] = colWidths;

    // Enable auto-filter on header row
    const lastCol = XLSX.utils.encode_col(headers.length - 1);
    ws["!autofilter"] = { ref: `A1:${lastCol}${rows.length}` };

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Sammenligning");

    // Add metadata sheet
    const metaWs = XLSX.utils.aoa_to_sheet([
        ["Sammenligning", comparisonName],
        ["Opprettet", new Date().toLocaleString("no-NO")],
        ["Hovedfil", matrix.mainFileName],
        ["Antall TFM-oppføringer", matrix.tfmEntries.length],
        ["Antall filer sammenlignet", matrix.fileNames.length],
    ]);
    metaWs["!cols"] = [{ wch: 25 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, metaWs, "Info");

    // Write to buffer
    const buffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
    });

    return Buffer.from(buffer);
}

/**
 * Generate a simple styled Excel export
 * Note: Basic xlsx doesn't support cell styling without additional libs
 * For production, consider using exceljs for full styling support
 */
export function generateStyledComparisonExcel(
    matrix: ComparisonMatrix,
    comparisonName: string
): Buffer {
    // For now, use the basic version
    // To add full styling with colors, we'd need exceljs
    return generateComparisonExcel(matrix, comparisonName);
}

/**
 * Parse comparison name for file-safe filename
 */
export function sanitizeFileName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9æøåÆØÅ\s-]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);
}

/**
 * Generate filename for comparison export
 */
export function generateExportFileName(comparisonName: string): string {
    const sanitized = sanitizeFileName(comparisonName);
    const timestamp = new Date().toISOString().split("T")[0];
    return `${sanitized}_${timestamp}.xlsx`;
}
