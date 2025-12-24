/**
 * PDF Generator for Protocol Export
 * 
 * Uses pdf-lib to generate PDF files server-side for email attachments.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
        status: string;
        responsible: string | null;
        executor: string | null;
        notes: string | null;
    }[];
}

interface FunctionTestPDFData {
    systemCode: string;
    systemName: string | null;
    systemOwner: string | null;
    projectName: string;
    rows: {
        systemPart: string;
        function: string;
        status: string;
        assignedTo: string | null;
        category: string;
    }[];
}

const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: "Ikke startet",
    IN_PROGRESS: "Pågår",
    COMPLETED: "Fullført",
    NA: "Ikke aktuelt",
    DEVIATION: "Avvik",
    NOT_APPLICABLE: "Ikke aktuelt",
};

function getStatusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
}

export async function generateMCProtocolPDF(data: ProtocolPDFData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;
    const lineHeight = 18;

    // Header
    page.drawText("MC Protokoll", {
        x: margin,
        y,
        size: 24,
        font: fontBold,
        color: rgb(0.12, 0.23, 0.54),
    });
    y -= 35;

    page.drawText(data.systemName || data.systemCode, {
        x: margin,
        y,
        size: 16,
        font: fontBold,
    });
    y -= 25;

    page.drawText(`Prosjekt: ${data.projectName}`, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
    });
    y -= 30;

    // Info section
    const infoItems = [
        { label: "Systemkode", value: data.systemCode },
        { label: "Systemeier", value: data.systemOwner || "-" },
        { label: "Periode", value: `${data.startTime ? format(data.startTime, "dd.MM.yyyy", { locale: nb }) : "-"} - ${data.endTime ? format(data.endTime, "dd.MM.yyyy", { locale: nb }) : "-"}` },
        { label: "Status", value: getStatusLabel(data.status) },
        { label: "Opprettet", value: format(data.createdAt, "dd.MM.yyyy", { locale: nb }) },
    ];

    for (const item of infoItems) {
        page.drawText(`${item.label}:`, {
            x: margin,
            y,
            size: 10,
            font: fontBold,
        });
        page.drawText(item.value, {
            x: margin + 80,
            y,
            size: 10,
            font,
        });
        y -= lineHeight;
    }
    y -= 20;

    // Table header
    const columns = [
        { label: "TFM-kode", x: margin, width: 80 },
        { label: "Komponent", x: margin + 85, width: 150 },
        { label: "Status", x: margin + 240, width: 70 },
        { label: "Ansvarlig", x: margin + 315, width: 100 },
        { label: "Notater", x: margin + 420, width: 120 },
    ];

    // Draw header background
    page.drawRectangle({
        x: margin - 5,
        y: y - 5,
        width: width - margin * 2 + 10,
        height: 20,
        color: rgb(0.94, 0.94, 0.96),
    });

    for (const col of columns) {
        page.drawText(col.label, {
            x: col.x,
            y,
            size: 9,
            font: fontBold,
        });
    }
    y -= 25;

    // Draw items
    for (const item of data.items) {
        if (y < 50) {
            page = pdfDoc.addPage([595, 842]);
            y = height - margin;
        }

        page.drawText(item.tfmCode.substring(0, 12), { x: columns[0].x, y, size: 8, font });
        page.drawText(item.component.substring(0, 25), { x: columns[1].x, y, size: 8, font });
        page.drawText(getStatusLabel(item.status), { x: columns[2].x, y, size: 8, font });
        page.drawText((item.responsible || "-").substring(0, 15), { x: columns[3].x, y, size: 8, font });
        page.drawText((item.notes || "-").substring(0, 20), { x: columns[4].x, y, size: 8, font });

        y -= lineHeight;
    }

    // Footer
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
        pages[i].drawText(`Side ${i + 1} av ${pages.length} | Generert: ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })}`, {
            x: margin,
            y: 25,
            size: 8,
            font,
            color: rgb(0.6, 0.6, 0.6),
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
    const margin = 50;
    let y = height - margin;
    const lineHeight = 18;

    // Header
    page.drawText("Funksjonstest", {
        x: margin,
        y,
        size: 24,
        font: fontBold,
        color: rgb(0.12, 0.35, 0.54),
    });
    y -= 35;

    page.drawText(data.systemName || data.systemCode, {
        x: margin,
        y,
        size: 16,
        font: fontBold,
    });
    y -= 25;

    page.drawText(`Prosjekt: ${data.projectName}`, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
    });
    y -= 30;

    // Info section
    const infoItems = [
        { label: "Systemkode", value: data.systemCode },
        { label: "Systemeier", value: data.systemOwner || "-" },
    ];

    for (const item of infoItems) {
        page.drawText(`${item.label}:`, {
            x: margin,
            y,
            size: 10,
            font: fontBold,
        });
        page.drawText(item.value, {
            x: margin + 80,
            y,
            size: 10,
            font,
        });
        y -= lineHeight;
    }
    y -= 20;

    // Table header
    const columns = [
        { label: "Systemdel", x: margin, width: 120 },
        { label: "Funksjon", x: margin + 125, width: 180 },
        { label: "Status", x: margin + 310, width: 80 },
        { label: "Tildelt", x: margin + 395, width: 100 },
    ];

    // Draw header background
    page.drawRectangle({
        x: margin - 5,
        y: y - 5,
        width: width - margin * 2 + 10,
        height: 20,
        color: rgb(0.94, 0.94, 0.96),
    });

    for (const col of columns) {
        page.drawText(col.label, {
            x: col.x,
            y,
            size: 9,
            font: fontBold,
        });
    }
    y -= 25;

    // Draw rows
    for (const row of data.rows) {
        if (y < 50) {
            page = pdfDoc.addPage([595, 842]);
            y = height - margin;
        }

        page.drawText(row.systemPart.substring(0, 20), { x: columns[0].x, y, size: 8, font });
        page.drawText(row.function.substring(0, 30), { x: columns[1].x, y, size: 8, font });
        page.drawText(getStatusLabel(row.status), { x: columns[2].x, y, size: 8, font });
        page.drawText((row.assignedTo || "-").substring(0, 15), { x: columns[3].x, y, size: 8, font });

        y -= lineHeight;
    }

    // Footer
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
        pages[i].drawText(`Side ${i + 1} av ${pages.length} | Generert: ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })}`, {
            x: margin,
            y: 25,
            size: 8,
            font,
            color: rgb(0.6, 0.6, 0.6),
        });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
