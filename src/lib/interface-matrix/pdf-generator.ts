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
    const page = pdfDoc.addPage([1190.55, 841.89]); // A3 landscape point size
    const { width, height } = page.getSize();

    const margin = 30;
    let y = height - margin;

    // Title
    page.drawText(`Grensesnittmatrise - ${data.projectName}`, {
        x: margin,
        y: y,
        size: 20,
        font: fontBold,
        color: rgb(0, 0, 0),
    });
    y -= 40;

    // Headers
    const sysColWidth = 200;
    let x = margin;

    // System Header
    page.drawRectangle({
        x, y: y - 20, width: sysColWidth, height: 20,
        borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(0.95, 0.95, 0.95)
    });
    page.drawText("System", { x: x + 5, y: y - 15, size: 10, font: fontBold });
    x += sysColWidth;

    const colWidth = (width - margin * 2 - sysColWidth) / data.columns.length;

    for (const col of data.columns) {
        const c = hexToRgb(col.color);
        page.drawRectangle({
            x, y: y - 20, width: colWidth, height: 20,
            borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(c.r, c.g, c.b)
        });
        page.drawText(col.discipline || col.customLabel || "", {
            x: x + 5, y: y - 15, size: 10, font: fontBold
        });
        x += colWidth;
    }
    y -= 20;

    // Rows
    for (const row of data.rows) {
        // Check page break
        if (y < margin + 20) {
            const newPage = pdfDoc.addPage([1190.55, 841.89]);
            y = 841.89 - margin;
            // Could redraw headers... for now simple list
        }

        x = margin;

        // System Cell
        page.drawRectangle({
            x, y: y - 40, width: sysColWidth, height: 40,
            borderColor: rgb(0, 0, 0), borderWidth: 1
        });

        page.drawText(row.systemCode, { x: x + 5, y: y - 15, size: 10, font: fontBold });
        if (row.description) {
            page.drawText(row.description, { x: x + 5, y: y - 30, size: 8, font: font, color: rgb(0.4, 0.4, 0.4) });
        }

        // Status Indicator
        // TODO: Draw Circle based on validation logic?
        // Implementing basic validation check logic here to match frontend
        // MANDATORY_TAGS = ["Montasje", "Leveranse", "Merking", "Systemeier", "Delansvarlig", "Kabling og kobling"]
        const tags = new Set<string>();
        row.cells.forEach(c => {
            if (Array.isArray(c.values)) (c.values as string[]).forEach(v => tags.add(v));
        });
        const missing = ["Montasje", "Leveranse", "Merking", "Systemeier", "Delansvarlig", "Kabling og kobling"].filter(t => !tags.has(t));
        const isOk = missing.length === 0;

        if (isOk) {
            page.drawCircle({ x: x + sysColWidth - 15, y: y - 20, size: 5, color: rgb(0, 1, 0) });
        } else {
            page.drawCircle({ x: x + sysColWidth - 15, y: y - 20, size: 5, color: rgb(1, 0, 0) });
        }

        x += sysColWidth;

        // Discipline Cells
        for (const col of data.columns) {
            const c = hexToRgb(col.color);
            // Lighten the color for cell background (simpler: use low opacity simulation or just same pastel)
            // User asked for "lys pastell gul farge" for values.

            page.drawRectangle({
                x, y: y - 40, width: colWidth, height: 40,
                borderColor: rgb(0, 0, 0), borderWidth: 1,
                color: rgb(c.r, c.g, c.b) // Using the column color directly as it should be pastel
            });

            const cell = row.cells.find(cell => cell.columnId === col.id);
            if (cell && Array.isArray(cell.values)) {
                const txt = (cell.values as string[]).join(", ");
                // Text wrapping simple logic
                // drawing just the first line for now or truncate
                // pdf-lib text wrapping is manual. 
                // We just truncate for MVP functionality
                if (txt.length > 0) {
                    const fontSize = 8;
                    page.drawText(txt, {
                        x: x + 2, y: y - 20, size: fontSize, font: font, maxWidth: colWidth - 4
                    });
                }
            }

            x += colWidth;
        }
        y -= 40;
    }

    return pdfDoc.save();
}
