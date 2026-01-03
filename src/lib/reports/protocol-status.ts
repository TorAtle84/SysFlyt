import "server-only";

import prisma from "@/lib/db";
import { ProtocolStatusReportItem, sendProtocolStatusReportEmail } from "@/lib/email";

type McProtocolItemLite = {
  columnA: string;
  columnB: string;
  columnC: string;
  responsibleId: string | null;
  executorId: string | null;
};

type FunctionTestRowLite = {
  status: string;
  performedById: string | null;
};

type FunctionTestResponsibleLite = {
  userId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getFunctionTestDateRange(dates: unknown): { start?: Date; end?: Date } {
  if (!isRecord(dates)) return {};

  const phaseData = dates["funksjonstest"];
  if (isRecord(phaseData)) {
    return {
      start: parseDate(phaseData["start"]),
      end: parseDate(phaseData["end"]),
    };
  }

  return {
    start: parseDate(dates["start"]),
    end: parseDate(dates["end"]),
  };
}

function computeMcProgress(items: McProtocolItemLite[]) {
  const totalItems = items.length;
  const completedItems = items.filter(
    (i) =>
      (i.columnA === "COMPLETED" || i.columnA === "NA") &&
      (i.columnB === "COMPLETED" || i.columnB === "NA") &&
      (i.columnC === "COMPLETED" || i.columnC === "NA")
  ).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  return { totalItems, completedItems, progress };
}

function computeFunctionTestProgress(rows: FunctionTestRowLite[]) {
  const totalRows = rows.length;
  const completedRows = rows.filter((r) =>
    ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(r.status)
  ).length;
  const progress = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;
  return { totalRows, completedRows, progress };
}

function formatMissingCountLabel(label: string, missingCount: number, totalCount?: number): string | null {
  if (missingCount <= 0) return null;
  if (totalCount && totalCount > 0) {
    // If all are missing, show "ikke valgt" instead of count
    if (missingCount === totalCount) {
      return `${label}: ikke valgt`;
    }
    return `${label}: ${totalCount - missingCount}/${totalCount} valgt`;
  }
  return `${label}: ikke valgt`;
}

function formatResponsiblesLabel(total: number, missing: number): string | null {
  if (total === 0) return "Delansvarlige: ingen valgt";
  if (missing <= 0) return null;
  if (missing === total) return "Delansvarlige: ikke valgt";
  return `Delansvarlige: ${total - missing}/${total} valgt`;
}

function buildBaseUrl() {
  const raw = process.env.REPORT_BASE_URL || process.env.NEXTAUTH_URL || "";
  return raw ? raw.replace(/\/$/, "") : "";
}

function buildTitle(systemCode: string, systemName?: string | null) {
  return systemName ? `${systemCode} – ${systemName}` : systemCode;
}

function buildMcProtocolItem(protocol: {
  id: string;
  systemCode: string;
  systemName: string | null;
  systemOwnerId: string | null;
  startTime: Date | null;
  endTime: Date | null;
  items: McProtocolItemLite[];
}, baseUrl: string, projectId: string): ProtocolStatusReportItem {
  const progressStats = computeMcProgress(protocol.items);
  const missingResponsibleCount = protocol.items.filter((i) => !i.responsibleId).length;
  const missingExecutorCount = protocol.items.filter((i) => !i.executorId).length;

  const missingLabels: string[] = [];
  if (!protocol.startTime) missingLabels.push("Startdato: mangler");
  if (!protocol.endTime) missingLabels.push("Sluttdato: mangler");
  if (!protocol.systemOwnerId) missingLabels.push("Systemansvarlig: ikke valgt");

  const delansvarligeLabel = formatMissingCountLabel(
    "Delansvarlige",
    missingResponsibleCount,
    progressStats.totalItems
  );
  if (delansvarligeLabel) missingLabels.push(delansvarligeLabel);

  const executorLabel = formatMissingCountLabel(
    "Utførende",
    missingExecutorCount,
    progressStats.totalItems
  );
  if (executorLabel) missingLabels.push(executorLabel);

  // Add component status
  if (progressStats.totalItems > 0) {
    missingLabels.push(`Komponenter: ${progressStats.completedItems}/${progressStats.totalItems} ferdig`);
  }

  const link = baseUrl ? `${baseUrl}/syslink/projects/${projectId}/protocols/${protocol.id}` : null;

  return {
    title: buildTitle(protocol.systemCode, protocol.systemName),
    progress: progressStats.progress,
    missingLabels,
    link,
  };
}

function buildFunctionTestItem(test: {
  id: string;
  systemCode: string;
  systemName: string | null;
  systemOwnerId: string | null;
  dates: unknown;
  responsibles: FunctionTestResponsibleLite[];
  rows: FunctionTestRowLite[];
}, baseUrl: string, projectId: string): ProtocolStatusReportItem {
  const progressStats = computeFunctionTestProgress(test.rows);
  const dateRange = getFunctionTestDateRange(test.dates);

  const responsiblesTotal = test.responsibles.length;
  const responsiblesAssigned = test.responsibles.filter((r) => !!r.userId).length;
  const responsiblesMissing = responsiblesTotal - responsiblesAssigned;
  const missingExecutorCount = test.rows.filter((r) => !r.performedById).length;

  const missingLabels: string[] = [];
  if (!dateRange.start) missingLabels.push("Startdato: mangler");
  if (!dateRange.end) missingLabels.push("Sluttdato: mangler");
  if (!test.systemOwnerId) missingLabels.push("Systemansvarlig: ikke valgt");

  const responsiblesLabel = formatResponsiblesLabel(responsiblesTotal, responsiblesMissing);
  if (responsiblesLabel) missingLabels.push(responsiblesLabel);

  const executorLabel = formatMissingCountLabel(
    "Utførende",
    missingExecutorCount,
    progressStats.totalRows
  );
  if (executorLabel) missingLabels.push(executorLabel);

  // Add test row status
  if (progressStats.totalRows > 0) {
    missingLabels.push(`Tester: ${progressStats.completedRows}/${progressStats.totalRows} ferdig`);
  }

  const link = baseUrl ? `${baseUrl}/syslink/projects/${projectId}/protocols/function-tests/${test.id}` : null;

  return {
    title: buildTitle(test.systemCode, test.systemName),
    progress: progressStats.progress,
    missingLabels,
    link,
  };
}

export async function sendDailyProtocolStatusReports() {
  if (process.env.REPORTS_ENABLED?.toLowerCase() === "false") {
    console.log("[reports] Daily reporting disabled via REPORTS_ENABLED=false.");
    return { sent: 0, skipped: 0, disabled: true };
  }

  const baseUrl = buildBaseUrl();
  const projects = await prisma.project.findMany({
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          reportsAsProjectLeaderEnabled: true,
        },
      },
      mcProtocols: {
        select: {
          id: true,
          systemCode: true,
          systemName: true,
          systemOwnerId: true,
          startTime: true,
          endTime: true,
          items: {
            select: {
              columnA: true,
              columnB: true,
              columnC: true,
              responsibleId: true,
              executorId: true,
            },
          },
        },
        orderBy: { systemCode: "asc" },
      },
      functionTests: {
        select: {
          id: true,
          systemCode: true,
          systemName: true,
          systemOwnerId: true,
          dates: true,
          responsibles: { select: { userId: true } },
          rows: { select: { status: true, performedById: true } },
        },
        orderBy: { systemCode: "asc" },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const project of projects) {
    const leader = project.createdBy;
    if (!leader?.email) {
      skipped++;
      continue;
    }

    if (leader.reportsAsProjectLeaderEnabled === false) {
      skipped++;
      continue;
    }

    const protocolItems = project.mcProtocols.map((protocol) =>
      buildMcProtocolItem(protocol, baseUrl, project.id)
    );
    const functionTestItems = project.functionTests.map((test) =>
      buildFunctionTestItem(test, baseUrl, project.id)
    );

    const hasMissing = [...protocolItems, ...functionTestItems].some(
      (item) => item.missingLabels.length > 0
    );

    if (!hasMissing) {
      skipped++;
      continue;
    }

    const projectUrl = baseUrl ? `${baseUrl}/syslink/projects/${project.id}` : null;
    const profileUrl = baseUrl ? `${baseUrl}/syslink/profile` : null;

    await sendProtocolStatusReportEmail({
      to: leader.email,
      recipientName: `${leader.firstName} ${leader.lastName}`.trim() || null,
      projectName: project.name,
      generatedAt: new Date(),
      protocols: protocolItems,
      functionTests: functionTestItems,
      projectUrl,
      profileUrl,
    });

    sent++;
  }

  return { sent, skipped };
}
