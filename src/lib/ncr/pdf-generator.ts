import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

type NcrUser = {
  firstName: string;
  lastName: string;
};

type NcrComment = {
  content: string;
  createdAt: Date;
  user: NcrUser;
};

type NcrPhoto = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
  caption?: string | null;
};

type NcrDetails = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  severity: string;
  status: string;
  reportedBy?: NcrUser | null;
  assignedTo?: NcrUser | null;
  linkedItemLabel?: string | null;
  rootCause?: string | null;
  corrective?: string | null;
  createdAt: Date;
  closedAt?: Date | null;
};

type NcrPdfData = {
  projectName: string;
  ncr: NcrDetails;
  comments: NcrComment[];
  photos: NcrPhoto[];
  logoBytes?: Uint8Array;
  logoMimeType?: "image/png" | "image/jpeg";
};

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "P\u00e5g\u00e5r",
  DEVIATION: "Avvik",
  CANCELED: "Avlyst",
  REMEDIATED: "Utbedret",
  COMPLETED: "Fullf\u00f8rt",
};

const CATEGORY_LABELS: Record<string, string> = {
  INSTALLATION: "Installasjon",
  DOCUMENTATION: "Dokumentasjon",
  EQUIPMENT: "Utstyr",
  SAFETY: "Sikkerhet",
  OTHER: "Annet",
};

const SEVERITY_LABELS: Record<string, string> = {
  LOW: "Lav",
  MEDIUM: "Middels",
  HIGH: "H\u00f8y",
  CRITICAL: "Kritisk",
};

function labelOrFallback(map: Record<string, string>, key?: string | null) {
  if (!key) return "-";
  return map[key] || key;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.12, 0.14, 0.17)
) {
  page.drawText(text, { x, y, size, font, color });
}

function drawMultiLineText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  maxWidth: number
): number {
  if (!text) return 0;
  const paragraphs = text.split(/\r?\n/);
  let currentY = y;
  let totalHeight = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);

      if (testWidth > maxWidth && line) {
        drawText(page, line, x, currentY, font, size);
        currentY -= lineHeight;
        totalHeight += lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) {
      drawText(page, line, x, currentY, font, size);
      currentY -= lineHeight;
      totalHeight += lineHeight;
    }
  }

  return totalHeight;
}

export async function generateNcrPdf(data: NcrPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 14;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  if (data.logoBytes) {
    const logo = data.logoMimeType === "image/jpeg"
      ? await pdfDoc.embedJpg(data.logoBytes)
      : await pdfDoc.embedPng(data.logoBytes);
    const logoWidth = 120;
    const logoScale = logoWidth / logo.width;
    const logoHeight = logo.height * logoScale;
    page.drawImage(logo, {
      x: pageWidth - margin - logoWidth,
      y: pageHeight - margin - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }

  drawText(page, "Avviksrapport (NCR)", margin, y, fontBold, 18, rgb(0.12, 0.23, 0.54));
  y -= 22;
  drawText(page, data.ncr.title, margin, y, fontBold, 13);
  y -= 18;
  drawText(
    page,
    `Prosjekt: ${data.projectName}`,
    margin,
    y,
    font,
    9,
    rgb(0.4, 0.4, 0.4)
  );
  y -= 20;

  const infoItems = [
    ["Status", labelOrFallback(STATUS_LABELS, data.ncr.status)],
    ["Kategori", labelOrFallback(CATEGORY_LABELS, data.ncr.category)],
    ["Alvorlighet", labelOrFallback(SEVERITY_LABELS, data.ncr.severity)],
    ["Rapportert av", data.ncr.reportedBy ? `${data.ncr.reportedBy.firstName} ${data.ncr.reportedBy.lastName}` : "-"],
    ["Tildelt", data.ncr.assignedTo ? `${data.ncr.assignedTo.firstName} ${data.ncr.assignedTo.lastName}` : "-"],
    ["Opprettet", format(data.ncr.createdAt, "dd.MM.yyyy HH:mm", { locale: nb })],
    ["Lukket", data.ncr.closedAt ? format(data.ncr.closedAt, "dd.MM.yyyy HH:mm", { locale: nb }) : "-"],
    ["Koblet til", data.ncr.linkedItemLabel || "-"],
  ];

  const colWidth = (pageWidth - margin * 2) / 2;
  const boxHeight = 90;
  page.drawRectangle({
    x: margin - 4,
    y: y - boxHeight + 8,
    width: pageWidth - margin * 2 + 8,
    height: boxHeight,
    color: rgb(0.97, 0.98, 0.99),
  });

  for (let i = 0; i < infoItems.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const xPos = margin + col * colWidth;
    const yPos = y - row * 22;
    drawText(page, infoItems[i][0].toUpperCase(), xPos, yPos, font, 7, rgb(0.4, 0.4, 0.4));
    drawText(page, infoItems[i][1], xPos, yPos - 10, fontBold, 9);
  }

  y -= boxHeight + 18;

  const contentWidth = pageWidth - margin * 2;

  const sections: Array<{ title: string; content?: string | null }> = [
    { title: "Beskrivelse", content: data.ncr.description },
    { title: "Rot\u00e5rsak", content: data.ncr.rootCause },
    { title: "Korrigerende tiltak", content: data.ncr.corrective },
  ];

  for (const section of sections) {
    if (y < 120) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    drawText(page, section.title, margin, y, fontBold, 11);
    y -= 14;
    const content = section.content?.trim() || "-";
    const used = drawMultiLineText(page, content, margin, y, font, 9, 12, contentWidth);
    y -= Math.max(18, used + 6);
  }

  const drawSectionHeader = (title: string) => {
    if (y < 80) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    drawText(page, title, margin, y, fontBold, 11);
    y -= 16;
  };

  drawSectionHeader("Kommentarer");
  if (data.comments.length === 0) {
    drawText(page, "Ingen kommentarer registrert.", margin, y, font, 9, rgb(0.45, 0.45, 0.45));
    y -= 18;
  } else {
    for (const comment of data.comments) {
      const author = `${comment.user.firstName} ${comment.user.lastName}`;
      const dateLabel = format(comment.createdAt, "dd.MM.yyyy HH:mm", { locale: nb });
      const header = `${author} \u2022 ${dateLabel}`;

      if (y < 90) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      drawText(page, header, margin, y, fontBold, 9, rgb(0.2, 0.2, 0.2));
      y -= 12;
      const used = drawMultiLineText(page, comment.content, margin, y, font, 9, 12, contentWidth);
      y -= Math.max(12, used + 6);
    }
  }

  drawSectionHeader("Bilder");
  if (data.photos.length === 0) {
    drawText(page, "Ingen bilder registrert.", margin, y, font, 9, rgb(0.45, 0.45, 0.45));
    y -= 18;
  } else {
    for (const photo of data.photos) {
      const image = photo.mimeType === "image/jpeg"
        ? await pdfDoc.embedJpg(photo.bytes)
        : await pdfDoc.embedPng(photo.bytes);

      const maxWidth = contentWidth;
      const maxHeight = 260;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      if (y - drawHeight < margin + 40) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      page.drawImage(image, {
        x: margin,
        y: y - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
      y -= drawHeight + 8;

      if (photo.caption) {
        const used = drawMultiLineText(page, photo.caption, margin, y, font, 8, 11, contentWidth);
        y -= Math.max(12, used + 4);
      } else {
        y -= 10;
      }
    }
  }

  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(
      `Eksportert fra SysFlyt ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })} | Side ${i + 1} av ${pages.length}`,
      {
        x: margin,
        y: 18,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5),
      }
    );
  }

  return pdfDoc.save();
}
