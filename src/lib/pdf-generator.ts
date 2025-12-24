/**
 * PDF Generator for Protocol Export
 * 
 * Uses pdf-lib to generate PDF files server-side for email attachments.
 * Matches the browser export format with A/B/C columns and signature fields.
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface ProtocolPDFData {
    systemCode: string;
    systemName: string | null;
    systemOwner: string | null;
    startTime: Date | null;
    endTime: Date | null;
    status: string;
    projectName: string;
    createdAt: Date;
    items: {
        tfmCode: string;
        component: string;
        productName?: string;
        columnA: string;
        columnB: string;
        columnC: string;
        responsible: string | null;
        executor: string | null;
        completedAt: Date | null;
        notes: string | null;
    }[];
}

interface FunctionTestPDFData {
    systemCode: string;
    systemName: string | null;
    systemOwner: string | null;
    projectName: string;
    startDate: Date | null;
    responsibles: {
        systemCode: string;
        discipline: string;
        userName: string | null;
    }[];
    rows: {
        systemPart: string;
        function: string;
        testExecution: string;
        acceptanceCriteria: string;
        status: string;
        completedDate: Date | null;
        category: string;
    }[];
}

const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: "Ikke startet",
    IN_PROGRESS: "Pågår",
    COMPLETED: "Fullført",
    NA: "N/A",
    DEVIATION: "Avvik",
    NOT_APPLICABLE: "N/A",
};

function getStatusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
}

function getStatusSymbol(status: string): string {
    switch (status) {
        case "COMPLETED": return "V";  // Checkmark
        case "IN_PROGRESS": return "~";
        case "DEVIATION": return "X";
        case "NA": return "-";
        default: return "o";
    }
}

function drawText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color = rgb(0.12, 0.14, 0.17),
    maxWidth?: number
): number {
    // Truncate text if needed
    let displayText = text;
    if (maxWidth) {
        const charWidth = size * 0.5;
        const maxChars = Math.floor(maxWidth / charWidth);
        if (text.length > maxChars) {
            displayText = text.substring(0, maxChars - 2) + "..";
        }
    }

    page.drawText(displayText, { x, y, size, font, color });
    return size;
}

export async function generateMCProtocolPDF(data: ProtocolPDFData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;
    const lineHeight = 14;

    // Header
    page.drawText("MC Protokoll", { x: margin, y, size: 18, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
    y -= 22;

    page.drawText(data.systemName || data.systemCode, { x: margin, y, size: 14, font: fontBold });
    y -= 18;

    page.drawText(`Prosjekt: ${data.projectName}`, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 25;

    // Info grid
    const infoItems = [
        ["Systemkode", data.systemCode],
        ["Systemeier", data.systemOwner || "-"],
        ["Periode", `${data.startTime ? format(data.startTime, "dd.MM.yyyy", { locale: nb }) : "-"} - ${data.endTime ? format(data.endTime, "dd.MM.yyyy", { locale: nb }) : "-"}`],
        ["Status", getStatusLabel(data.status)],
        ["Fremdrift", `${data.items.filter(i => i.columnA === "COMPLETED" && i.columnB === "COMPLETED" && i.columnC === "COMPLETED").length} / ${data.items.length}`],
        ["Opprettet", format(data.createdAt, "dd.MM.yyyy", { locale: nb })],
    ];

    // Draw info box background
    page.drawRectangle({ x: margin - 5, y: y - 50, width: width - margin * 2 + 10, height: 55, color: rgb(0.97, 0.98, 0.99) });

    const colWidth = (width - margin * 2) / 3;
    for (let i = 0; i < infoItems.length; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const xPos = margin + col * colWidth;
        const yPos = y - row * 25;

        page.drawText(infoItems[i][0].toUpperCase(), { x: xPos, y: yPos, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        page.drawText(infoItems[i][1], { x: xPos, y: yPos - 10, size: 9, font: fontBold });
    }
    y -= 70;

    // Column legend
    const legendItems = ["A: Montasje", "B: Merket", "C: Koblet", "D: Komponent", "F: Ansvarlig", "G: Utførende", "H: Dato"];
    let legendX = margin;
    for (const item of legendItems) {
        page.drawText(item, { x: legendX, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        legendX += 70;
    }
    y -= 20;

    // Table header
    const columns = [
        { label: "TFM-kode", x: margin, width: 85 },
        { label: "A", x: margin + 90, width: 20 },
        { label: "B", x: margin + 115, width: 20 },
        { label: "C", x: margin + 140, width: 20 },
        { label: "D-Komponent", x: margin + 165, width: 80 },
        { label: "F-Ansvarlig", x: margin + 250, width: 75 },
        { label: "G-Utførende", x: margin + 330, width: 75 },
        { label: "H-Dato", x: margin + 410, width: 45 },
        { label: "Notater", x: margin + 460, width: 95 },
    ];

    // Header background
    page.drawRectangle({ x: margin - 2, y: y - 5, width: width - margin * 2 + 4, height: 16, color: rgb(0.94, 0.95, 0.96) });

    for (const col of columns) {
        page.drawText(col.label, { x: col.x, y, size: 7, font: fontBold });
    }
    y -= 18;

    // Draw items
    for (const item of data.items) {
        if (y < 100) {
            // Add new page
            page = pdfDoc.addPage([595, 842]);
            y = height - margin;

            // Repeat header on new page
            page.drawRectangle({ x: margin - 2, y: y - 5, width: width - margin * 2 + 4, height: 16, color: rgb(0.94, 0.95, 0.96) });
            for (const col of columns) {
                page.drawText(col.label, { x: col.x, y, size: 7, font: fontBold });
            }
            y -= 18;
        }

        // TFM code
        drawText(page, item.tfmCode, columns[0].x, y, fontBold, 7, undefined, columns[0].width);
        if (item.productName) {
            drawText(page, item.productName, columns[0].x, y - 8, font, 6, rgb(0.4, 0.4, 0.4), columns[0].width);
        }

        // Status columns A, B, C
        const getStatusColor = (status: string) => {
            switch (status) {
                case "COMPLETED": return rgb(0.09, 0.64, 0.29);
                case "IN_PROGRESS": return rgb(0.96, 0.62, 0.04);
                case "DEVIATION": return rgb(0.86, 0.14, 0.14);
                default: return rgb(0.61, 0.64, 0.67);
            }
        };

        page.drawText(getStatusSymbol(item.columnA), { x: columns[1].x + 5, y, size: 9, font: fontBold, color: getStatusColor(item.columnA) });
        page.drawText(getStatusSymbol(item.columnB), { x: columns[2].x + 5, y, size: 9, font: fontBold, color: getStatusColor(item.columnB) });
        page.drawText(getStatusSymbol(item.columnC), { x: columns[3].x + 5, y, size: 9, font: fontBold, color: getStatusColor(item.columnC) });

        // Component
        drawText(page, item.component || "-", columns[4].x, y, font, 7, undefined, columns[4].width);

        // Responsible & Executor
        drawText(page, item.responsible || "-", columns[5].x, y, font, 7, undefined, columns[5].width);
        drawText(page, item.executor || "-", columns[6].x, y, font, 7, undefined, columns[6].width);

        // Date
        const dateStr = item.completedAt ? format(item.completedAt, "dd.MM.yy", { locale: nb }) : "-";
        page.drawText(dateStr, { x: columns[7].x, y, size: 7, font });

        // Notes
        drawText(page, item.notes || "-", columns[8].x, y, font, 6, undefined, columns[8].width);

        y -= lineHeight + (item.productName ? 6 : 0);
    }

    // Signature section
    y -= 30;
    if (y < 120) {
        page = pdfDoc.addPage([595, 842]);
        y = height - margin;
    }

    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    y -= 30;

    // Systemeier signature
    page.drawText("Systemeier", { x: margin, y, size: 10, font: fontBold });
    y -= 20;
    page.drawText("Dato:", { x: margin, y, size: 8, font });
    page.drawLine({ start: { x: margin + 30, y - 2 }, end: { x: margin + 100, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
page.drawText("Signatur:", { x: margin + 120, y, size: 8, font });
page.drawLine({ start: { x: margin + 165, y - 2 }, end: { x: margin + 300, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });

// Kontrollør signature
const rightCol = width / 2 + 20;
page.drawText("Kontrollør", { x: rightCol, y: y + 20, size: 10, font: fontBold });
page.drawText("Dato:", { x: rightCol, y, size: 8, font });
page.drawLine({ start: { x: rightCol + 30, y - 2 }, end: { x: rightCol + 100, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
page.drawText("Signatur:", { x: rightCol + 120, y, size: 8, font });
page.drawLine({ start: { x: rightCol + 165, y - 2 }, end: { x: width - margin, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });

// Footer on all pages
const pages = pdfDoc.getPages();
for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`Eksportert fra SysFlyt ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })} | Side ${i + 1} av ${pages.length}`, {
        x: margin,
        y: 20,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5),
    });
}

const pdfBytes = await pdfDoc.save();
return Buffer.from(pdfBytes);
}

export async function generateFunctionTestPDF(data: FunctionTestPDFData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;
    const lineHeight = 14;

    // Header
    page.drawText("Funksjonstest", { x: margin, y, size: 18, font: fontBold, color: rgb(0.12, 0.35, 0.54) });
    y -= 22;

    page.drawText(`${data.systemName || data.systemCode}`, { x: margin, y, size: 14, font: fontBold });
    y -= 18;

    page.drawText(`Prosjekt: ${data.projectName}`, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 25;

    // Info section
    page.drawRectangle({ x: margin - 5, y: y - 30, width: width - margin * 2 + 10, height: 35, color: rgb(0.97, 0.98, 0.99) });

    page.drawText("SYSTEMEIER", { x: margin, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(data.systemOwner || "-", { x: margin, y: y - 10, size: 9, font: fontBold });

    page.drawText("PLANLAGT DATO", { x: margin + 150, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(data.startDate ? format(data.startDate, "dd.MM.yyyy", { locale: nb }) : "-", { x: margin + 150, y: y - 10, size: 9, font: fontBold });

    page.drawText("ANTALL TESTER", { x: margin + 300, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`${data.rows.length}`, { x: margin + 300, y: y - 10, size: 9, font: fontBold });

    y -= 50;

    // Delansvarlige section
    if (data.responsibles.length > 0) {
        page.drawText("Delansvarlige", { x: margin, y, size: 11, font: fontBold });
        y -= 15;

        // Header
        page.drawRectangle({ x: margin - 2, y: y - 5, width: width - margin * 2 + 4, height: 14, color: rgb(0.94, 0.95, 0.96) });
        page.drawText("System", { x: margin, y, size: 8, font: fontBold });
        page.drawText("Disiplin", { x: margin + 150, y, size: 8, font: fontBold });
        page.drawText("Ansvarlig", { x: margin + 300, y, size: 8, font: fontBold });
        y -= 16;

        for (const r of data.responsibles) {
            page.drawText(r.systemCode, { x: margin, y, size: 8, font });
            page.drawText(r.discipline, { x: margin + 150, y, size: 8, font });
            page.drawText(r.userName || "-", { x: margin + 300, y, size: 8, font });
            y -= 12;
        }
        y -= 15;
    }

    // Testpunkter
    page.drawText("Testpunkter", { x: margin, y, size: 11, font: fontBold });
    y -= 15;

    // Table header
    const columns = [
        { label: "#", x: margin, width: 20 },
        { label: "Kategori", x: margin + 25, width: 55 },
        { label: "Systemdel", x: margin + 85, width: 60 },
        { label: "Funksjon", x: margin + 150, width: 60 },
        { label: "Testutførelse", x: margin + 215, width: 100 },
        { label: "Akseptkriterie", x: margin + 320, width: 90 },
        { label: "Status", x: margin + 415, width: 50 },
        { label: "Dato", x: margin + 470, width: 45 },
    ];

    page.drawRectangle({ x: margin - 2, y: y - 5, width: width - margin * 2 + 4, height: 14, color: rgb(0.94, 0.95, 0.96) });
    for (const col of columns) {
        page.drawText(col.label, { x: col.x, y, size: 7, font: fontBold });
    }
    y -= 16;

    // Draw rows
    for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];

        if (y < 100) {
            page = pdfDoc.addPage([595, 842]);
            y = height - margin;

            // Repeat header
            page.drawRectangle({ x: margin - 2, y: y - 5, width: width - margin * 2 + 4, height: 14, color: rgb(0.94, 0.95, 0.96) });
            for (const col of columns) {
                page.drawText(col.label, { x: col.x, y, size: 7, font: fontBold });
            }
            y -= 16;
        }

        page.drawText(`${i + 1}`, { x: columns[0].x, y, size: 7, font });
        drawText(page, row.category, columns[1].x, y, font, 6, undefined, columns[1].width);
        drawText(page, row.systemPart, columns[2].x, y, font, 7, undefined, columns[2].width);
        drawText(page, row.function, columns[3].x, y, font, 7, undefined, columns[3].width);
        drawText(page, row.testExecution, columns[4].x, y, font, 6, undefined, columns[4].width);
        drawText(page, row.acceptanceCriteria, columns[5].x, y, font, 6, undefined, columns[5].width);

        // Status with color
        const statusColor = row.status === "COMPLETED" ? rgb(0.09, 0.64, 0.29) :
            row.status === "DEVIATION" ? rgb(0.86, 0.14, 0.14) : rgb(0.4, 0.4, 0.4);
        page.drawText(getStatusLabel(row.status), { x: columns[6].x, y, size: 6, font, color: statusColor });

        // Date
        const dateStr = row.completedDate ? format(row.completedDate, "dd.MM.yy", { locale: nb }) : "-";
        page.drawText(dateStr, { x: columns[7].x, y, size: 7, font });

        y -= lineHeight;
    }

    // Signature section
    y -= 25;
    if (y < 80) {
        page = pdfDoc.addPage([595, 842]);
        y = height - margin;
    }

    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    y -= 25;

    // Systemeier signature
    page.drawText("Systemeier", { x: margin, y, size: 10, font: fontBold });
    y -= 18;
    page.drawText("Dato:", { x: margin, y, size: 8, font });
    page.drawLine({ start: { x: margin + 30, y - 2 }, end: { x: margin + 100, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
page.drawText("Signatur:", { x: margin + 120, y, size: 8, font });
page.drawLine({ start: { x: margin + 165, y - 2 }, end: { x: margin + 300, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });

// Kontrollør signature
const rightCol = width / 2 + 20;
page.drawText("Kontrollør", { x: rightCol, y: y + 18, size: 10, font: fontBold });
page.drawText("Dato:", { x: rightCol, y, size: 8, font });
page.drawLine({ start: { x: rightCol + 30, y - 2 }, end: { x: rightCol + 100, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
page.drawText("Signatur:", { x: rightCol + 120, y, size: 8, font });
page.drawLine({ start: { x: rightCol + 165, y - 2 }, end: { x: width - margin, y - 2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });

// Footer on all pages
const pages = pdfDoc.getPages();
for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`Eksportert fra SysFlyt ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })} | Side ${i + 1} av ${pages.length}`, {
        x: margin,
        y: 20,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5),
    });
}

const pdfBytes = await pdfDoc.save();
return Buffer.from(pdfBytes);
}
