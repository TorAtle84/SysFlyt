import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { InterfaceMatrixColumn, InterfaceMatrixRow, InterfaceMatrixCell } from "@prisma/client";

// Helper to convert hex to rgb
function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : { r: 1, g: 1, b: 1 }; // Default white
}

// Helper to wrap text into lines that fit within maxWidth
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const words = text.split(/[\s,]+/).filter(w => w.length > 0);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine ? `${currentLine}, ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

// Calculate required row height based on content
function calculateRowHeight(
    row: InterfaceMatrixRow & { cells: InterfaceMatrixCell[] },
    columns: InterfaceMatrixColumn[],
    font: PDFFont,
    fontSize: number,
    colWidth: number,
    lineHeight: number
): number {
    let maxLines = 1;

    for (const col of columns) {
        const cell = row.cells.find(c => c.columnId === col.id);
        if (cell && Array.isArray(cell.values) && cell.values.length > 0) {
            const txt = (cell.values as string[]).join(", ");
            const lines = wrapText(txt, font, fontSize, colWidth - 10);
            maxLines = Math.max(maxLines, lines.length);
        }
    }

    // Minimum height for system code + description, or content lines
    const minHeight = 45;
    const contentHeight = maxLines * lineHeight + 15;
    return Math.max(minHeight, contentHeight);
}

type MatrixData = {
    columns: InterfaceMatrixColumn[];
    rows: (InterfaceMatrixRow & { cells: InterfaceMatrixCell[] })[];
    projectName: string;
};

export async function generateInterfaceMatrixPdf(data: MatrixData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // A3 Landscape for more width
    const pageWidth = 1190.55;
    const pageHeight = 841.89;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    const margin = 30;
    let y = pageHeight - margin;

    // Title
    page.drawText(`Grensesnittmatrise - ${data.projectName}`, {
        x: margin,
        y: y,
        size: 20,
        font: fontBold,
        color: rgb(0, 0, 0),
    });
    y -= 40;

    // Calculate column widths
    const sysColWidth = 180;
    const colWidth = (pageWidth - margin * 2 - sysColWidth) / data.columns.length;
    const fontSize = 8;
    const lineHeight = 11;
    const headerHeight = 25;

    // Draw headers function
    function drawHeaders(pg: PDFPage, startY: number): number {
        let x = margin;

        // System Header
        pg.drawRectangle({
            x, y: startY - headerHeight, width: sysColWidth, height: headerHeight,
            borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(0.95, 0.95, 0.95)
        });
        pg.drawText("System", { x: x + 5, y: startY - 17, size: 11, font: fontBold });
        x += sysColWidth;

        for (const col of data.columns) {
            const c = hexToRgb(col.color);
            pg.drawRectangle({
                x, y: startY - headerHeight, width: colWidth, height: headerHeight,
                borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(c.r, c.g, c.b)
            });
            pg.drawText(col.discipline || col.customLabel || "", {
                x: x + 5, y: startY - 17, size: 10, font: fontBold
            });
            x += colWidth;
        }
        return startY - headerHeight;
    }

    y = drawHeaders(page, y);

    // Rows
    for (const row of data.rows) {
        const rowHeight = calculateRowHeight(row, data.columns, font, fontSize, colWidth, lineHeight);

        // Check page break
        if (y - rowHeight < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
            y = drawHeaders(page, y);
        }

        let x = margin;

        // System Cell
        page.drawRectangle({
            x, y: y - rowHeight, width: sysColWidth, height: rowHeight,
            borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(1, 1, 1)
        });

        page.drawText(row.systemCode, { x: x + 5, y: y - 15, size: 10, font: fontBold });
        if (row.description) {
            // Truncate description if too long
            const maxDescWidth = sysColWidth - 25;
            let desc = row.description;
            while (font.widthOfTextAtSize(desc, 8) > maxDescWidth && desc.length > 3) {
                desc = desc.slice(0, -4) + "...";
            }
            page.drawText(desc, { x: x + 5, y: y - 28, size: 8, font: font, color: rgb(0.4, 0.4, 0.4) });
        }

        // Status Indicator
        const tags = new Set<string>();
        row.cells.forEach(c => {
            if (Array.isArray(c.values)) (c.values as string[]).forEach(v => tags.add(v));
        });
        const missing = ["Montasje", "Leveranse", "Merking", "Systemeier", "Delansvarlig", "Kabling og kobling"].filter(t => !tags.has(t));
        const isOk = missing.length === 0;

        page.drawCircle({
            x: x + sysColWidth - 12,
            y: y - 12,
            size: 5,
            color: isOk ? rgb(0.2, 0.8, 0.2) : rgb(0.9, 0.2, 0.2)
        });

        x += sysColWidth;

        // Discipline Cells
        for (const col of data.columns) {
            const c = hexToRgb(col.color);

            page.drawRectangle({
                x, y: y - rowHeight, width: colWidth, height: rowHeight,
                borderColor: rgb(0, 0, 0), borderWidth: 1,
                color: rgb(c.r, c.g, c.b)
            });

            const cell = row.cells.find(cell => cell.columnId === col.id);
            if (cell && Array.isArray(cell.values) && cell.values.length > 0) {
                const txt = (cell.values as string[]).join(", ");
                const lines = wrapText(txt, font, fontSize, colWidth - 10);

                let textY = y - 12;
                for (const line of lines) {
                    if (textY > y - rowHeight + 5) {
                        page.drawText(line, {
                            x: x + 5, y: textY, size: fontSize, font: font, color: rgb(0.1, 0.1, 0.1)
                        });
                        textY -= lineHeight;
                    }
                }
            }

            x += colWidth;
        }
        y -= rowHeight;
    }

    return pdfDoc.save();
}
