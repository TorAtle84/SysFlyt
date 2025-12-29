import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { format, getISOWeek } from "date-fns";
import { nb } from "date-fns/locale";

type PlanPhase = "ioTesting" | "egentest" | "funksjonstest";
type PdfColor = ReturnType<typeof rgb>;

export type PlansystemPdfResponsible = {
  systemCode: string;
  discipline: string;
  testParticipation: string | null;
  prerequisites: string | null;
  user?: { firstName: string; lastName: string } | null;
};

export type PlansystemPdfFunctionTest = {
  systemCode: string;
  systemName: string | null;
  systemOwner: { firstName: string; lastName: string } | null;
  systemOwnerDiscipline: string | null;
  softwareResponsible: string | null;
  dates: unknown;
  responsibles: PlansystemPdfResponsible[];
};

type PhaseMeta = {
  key: PlanPhase;
  label: string;
  sortOrder: number;
};

const PHASES: PhaseMeta[] = [
  { key: "ioTesting", label: "I/O-test", sortOrder: 0 },
  { key: "egentest", label: "Egentest", sortOrder: 1 },
  { key: "funksjonstest", label: "Funksjonstest", sortOrder: 2 },
];

type ParsedDates = { start?: Date; end?: Date };

type PlanItem = {
  phase: PlanPhase;
  phaseLabel: string;
  sortOrder: number;
  start: Date;
  end: Date;
  systemCode: string;
  systemName: string | null;
  systemOwnerText: string;
  ownerText: string;
  responsibles: PlansystemPdfResponsible[];
  prerequisites: Array<{ discipline: string; systemCode: string; text: string }>;
  isFirstForSystem: boolean; // True if this is the first phase entry for this system (to show delansvarlige only once)
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function normalizeDateRange(range: ParsedDates): { start: Date; end: Date } | null {
  const start = range.start;
  const end = range.end;

  if (!start && !end) return null;
  const normalizedStart = start ?? end;
  const normalizedEnd = end ?? start;
  if (!normalizedStart || !normalizedEnd) return null;
  if (normalizedStart.getTime() <= normalizedEnd.getTime()) {
    return { start: normalizedStart, end: normalizedEnd };
  }
  return { start: normalizedEnd, end: normalizedStart };
}

function getPhaseDates(dates: unknown, phase: PlanPhase): ParsedDates {
  if (!isRecord(dates)) return {};

  const phaseData = dates[phase];
  if (isRecord(phaseData)) {
    return {
      start: parseDate(phaseData["start"]),
      end: parseDate(phaseData["end"]),
    };
  }

  if (phase === "funksjonstest") {
    return {
      start: parseDate(dates["start"]),
      end: parseDate(dates["end"]),
    };
  }

  return {};
}

function formatUserName(user: { firstName: string; lastName: string } | null): string {
  if (!user) return "";
  return `${user.firstName} ${user.lastName}`.trim();
}

function formatSystemOwner(test: PlansystemPdfFunctionTest): string {
  const person = formatUserName(test.systemOwner);
  const discipline = test.systemOwnerDiscipline?.trim() || "";

  if (person && discipline) return `${person} (${discipline})`;
  if (person) return person;
  if (discipline) return discipline;
  return "-";
}

function buildOwnerText(phase: PlanPhase, test: PlansystemPdfFunctionTest, responsibles: PlansystemPdfResponsible[]): string {
  if (phase === "ioTesting") {
    return test.softwareResponsible?.trim() || "-";
  }

  const disciplines = Array.from(
    new Set(
      responsibles
        .map((r) => r.discipline?.trim())
        .filter((v): v is string => !!v)
    )
  ).sort((a, b) => a.localeCompare(b, "nb"));

  return disciplines.length > 0 ? disciplines.join(", ") : "-";
}

function hasParticipationData(responsibles: PlansystemPdfResponsible[]): boolean {
  return responsibles.some((r) => !!r.testParticipation);
}

function matchesPhaseParticipation(phase: PlanPhase, testParticipation: string | null): boolean {
  if (!testParticipation) return false;
  if (phase === "egentest") return testParticipation === "Egentest" || testParticipation === "Begge";
  if (phase === "funksjonstest") return testParticipation === "Funksjonstest" || testParticipation === "Begge";
  return true;
}

function getResponsiblesForPhase(phase: PlanPhase, test: PlansystemPdfFunctionTest): PlansystemPdfResponsible[] {
  const all = test.responsibles || [];
  if (phase === "ioTesting") return all;

  if (!hasParticipationData(all)) return all;

  const filtered = all.filter((r) => matchesPhaseParticipation(phase, r.testParticipation));
  return filtered.length > 0 ? filtered : all;
}

function buildPrerequisites(responsibles: PlansystemPdfResponsible[]): Array<{ discipline: string; systemCode: string; text: string }> {
  return responsibles
    .map((r) => ({
      discipline: r.discipline?.trim() || "-",
      systemCode: r.systemCode?.trim() || "-",
      text: (r.prerequisites || "").trim(),
    }))
    .filter((p) => p.text.length > 0)
    .sort((a, b) => {
      const discipline = a.discipline.localeCompare(b.discipline, "nb");
      if (discipline !== 0) return discipline;
      return a.systemCode.localeCompare(b.systemCode, "nb");
    });
}

function buildPlanItems(tests: PlansystemPdfFunctionTest[]): PlanItem[] {
  const items: PlanItem[] = [];

  for (const test of tests) {
    // Get ALL responsibles for the function test (for delansvarlige display - not filtered by phase)
    const allResponsibles = (test.responsibles || []).slice().sort((a, b) => {
      const discipline = (a.discipline || "").localeCompare(b.discipline || "", "nb");
      if (discipline !== 0) return discipline;
      const system = (a.systemCode || "").localeCompare(b.systemCode || "", "nb");
      if (system !== 0) return system;
      const userA = formatUserName(a.user || null);
      const userB = formatUserName(b.user || null);
      return userA.localeCompare(userB, "nb");
    });
    const allPrerequisites = buildPrerequisites(allResponsibles);

    let isFirstPhaseForThisTest = true;

    for (const phaseMeta of PHASES) {
      const range = normalizeDateRange(getPhaseDates(test.dates, phaseMeta.key));
      if (!range) continue;

      // Get phase-specific responsibles for the owner text only
      const phaseResponsibles = getResponsiblesForPhase(phaseMeta.key, test).slice().sort((a, b) => {
        const discipline = (a.discipline || "").localeCompare(b.discipline || "", "nb");
        if (discipline !== 0) return discipline;
        const system = (a.systemCode || "").localeCompare(b.systemCode || "", "nb");
        if (system !== 0) return system;
        const userA = formatUserName(a.user || null);
        const userB = formatUserName(b.user || null);
        return userA.localeCompare(userB, "nb");
      });

      items.push({
        phase: phaseMeta.key,
        phaseLabel: phaseMeta.label,
        sortOrder: phaseMeta.sortOrder,
        start: range.start,
        end: range.end,
        systemCode: test.systemCode,
        systemName: test.systemName,
        systemOwnerText: formatSystemOwner(test),
        ownerText: buildOwnerText(phaseMeta.key, test, phaseResponsibles),
        // Use ALL responsibles for delansvarlige, but only show on first phase
        responsibles: allResponsibles,
        prerequisites: allPrerequisites,
        isFirstForSystem: isFirstPhaseForThisTest,
      });

      isFirstPhaseForThisTest = false;
    }
  }

  return items.sort((a, b) => {
    const start = a.start.getTime() - b.start.getTime();
    if (start !== 0) return start;
    const order = a.sortOrder - b.sortOrder;
    if (order !== 0) return order;
    return a.systemCode.localeCompare(b.systemCode, "nb");
  });
}

function formatDateRangeWithWeek(start: Date, end: Date): string {
  const week = getISOWeek(start);
  const weekStr = String(week).padStart(2, "0");
  return `Uke ${weekStr}: ${format(start, "dd.MM.yyyy", { locale: nb })} - ${format(end, "dd.MM.yyyy", { locale: nb })}`;
}

function normalizePdfText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = normalizePdfText(text);
  const rawLines = normalized.split("\n");
  const wrapped: string[] = [];

  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (line.trim().length === 0) {
      wrapped.push("");
      continue;
    }

    const words = line.split(/\s+/).filter(Boolean);
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }
      if (current) wrapped.push(current);
      current = word;
    }

    if (current) wrapped.push(current);
  }

  while (wrapped.length > 0 && wrapped[wrapped.length - 1] === "") {
    wrapped.pop();
  }

  return wrapped;
}

function buildDisplayFileName(projectName: string, at: Date): string {
  const date = format(at, "yyyy-MM-dd");
  const safeProject = projectName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 80);

  return `Plansystem_${safeProject || "Prosjekt"}_${date}.pdf`;
}

export type PlansystemPdfInput = {
  projectName: string;
  tests: PlansystemPdfFunctionTest[];
  generatedAt?: Date;
};

export async function generatePlansystemPdf({ projectName, tests, generatedAt }: PlansystemPdfInput): Promise<{
  fileName: string;
  bytes: Uint8Array;
}> {
  const createdAt = generatedAt ?? new Date();
  const items = buildPlanItems(tests);

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const margin = 48;

  const colorText = rgb(0.1, 0.12, 0.14);
  const colorMuted = rgb(0.35, 0.39, 0.44);
  const colorRule = rgb(0.87, 0.89, 0.92);
  const colorAccent = rgb(0.02, 0.39, 0.75);

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = page.getHeight() - margin;

  const lineHeight = (fontSize: number) => Math.ceil(fontSize * 1.25);

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight >= margin) return;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = page.getHeight() - margin;
  };

  const drawWrapped = (text: string, options: { x: number; font: PDFFont; size: number; color: PdfColor; maxWidth: number }) => {
    const lines = wrapText(text, options.font, options.size, options.maxWidth);
    for (const ln of lines) {
      ensureSpace(lineHeight(options.size));
      page.drawText(ln, {
        x: options.x,
        y: cursorY,
        font: options.font,
        size: options.size,
        color: options.color,
      });
      cursorY -= lineHeight(options.size);
    }
  };

  // Header
  page.drawText("Plansystem", { x: margin, y: cursorY, font: fontBold, size: 22, color: colorText });
  cursorY -= lineHeight(22);

  page.drawText(projectName, { x: margin, y: cursorY, font: fontRegular, size: 12, color: colorMuted });
  cursorY -= lineHeight(12);

  page.drawText(`Generert: ${format(createdAt, "dd.MM.yyyy HH:mm", { locale: nb })}`, {
    x: margin,
    y: cursorY,
    font: fontRegular,
    size: 10,
    color: colorMuted,
  });
  cursorY -= lineHeight(10) + 8;

  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: page.getWidth() - margin, y: cursorY },
    thickness: 1,
    color: colorRule,
  });
  cursorY -= 18;

  if (items.length === 0) {
    drawWrapped("Ingen funksjonstester med dato er satt i prosjektet.", {
      x: margin,
      font: fontRegular,
      size: 11,
      color: colorText,
      maxWidth: page.getWidth() - margin * 2,
    });
  } else {
    for (const item of items) {
      ensureSpace(80);

      const systemLabel = item.systemName ? `${item.systemCode} – ${item.systemName}` : item.systemCode;
      const mainLine = `${formatDateRangeWithWeek(item.start, item.end)} | ${systemLabel} — Systemeier: ${item.systemOwnerText}`;
      drawWrapped(mainLine, {
        x: margin,
        font: fontBold,
        size: 11,
        color: colorText,
        maxWidth: page.getWidth() - margin * 2,
      });

      drawWrapped(`- ${item.phaseLabel} – Ansvarlig: ${item.ownerText}`, {
        x: margin + 14,
        font: fontRegular,
        size: 10,
        color: colorText,
        maxWidth: page.getWidth() - margin * 2 - 14,
      });

      // Only show delansvarlige and forutsetninger once per function test (on first phase)
      if (item.isFirstForSystem) {
        const participants = item.responsibles.map((r) => {
          const user = r.user ? ` (${formatUserName(r.user)})` : "";
          return `${r.systemCode} - ${r.discipline}${user}`;
        });

        drawWrapped(`- Delansvarlige: ${participants.length > 0 ? participants.join(", ") : "-"}`, {
          x: margin + 14,
          font: fontRegular,
          size: 10,
          color: colorText,
          maxWidth: page.getWidth() - margin * 2 - 14,
        });

        if (item.prerequisites.length > 0) {
          ensureSpace(lineHeight(10));
          page.drawText("Forutsetninger", {
            x: margin + 28,
            y: cursorY,
            font: fontBold,
            size: 10,
            color: colorAccent,
          });
          cursorY -= lineHeight(10);

          for (const p of item.prerequisites) {
            drawWrapped(`- ${p.discipline} - ${p.systemCode}: ${p.text}`, {
              x: margin + 28,
              font: fontRegular,
              size: 9.5,
              color: colorMuted,
              maxWidth: page.getWidth() - margin * 2 - 28,
            });
          }
        }
      }

      cursorY -= 10;
      if (cursorY < margin + 12) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        cursorY = page.getHeight() - margin;
      }
    }
  }

  // Footer page numbers
  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    const label = `${idx + 1} / ${pages.length}`;
    const size = 9;
    const width = fontRegular.widthOfTextAtSize(label, size);
    p.drawText(label, {
      x: p.getWidth() - margin - width,
      y: margin / 2,
      font: fontRegular,
      size,
      color: colorMuted,
    });
  });

  const bytes = await pdfDoc.save();
  const fileName = buildDisplayFileName(projectName, createdAt);
  return { fileName, bytes };
}
