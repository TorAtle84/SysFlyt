/**
 * MC Protocol PDF Export API
 * GET: Generate and download protocol as PDF (printable HTML)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; protocolId: string }> }
) {
    try {
        const { projectId, protocolId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        // Fetch protocol with all items and relations
        const protocol = await prisma.mCProtocol.findUnique({
            where: { id: protocolId, projectId },
            include: {
                items: {
                    orderBy: { createdAt: "asc" },
                    include: {
                        responsible: {
                            select: { firstName: true, lastName: true },
                        },
                        executor: {
                            select: { firstName: true, lastName: true },
                        },
                        massList: {
                            select: {
                                tfm: true,
                                component: true,
                                productName: true,
                            },
                        },
                    },
                },
                project: {
                    select: { name: true },
                },
                assignedUser: {
                    select: { firstName: true, lastName: true },
                },
            },
        });

        if (!protocol) {
            return NextResponse.json(
                { error: "Protokoll ikke funnet" },
                { status: 404 }
            );
        }

        // Fetch system owner if set
        let systemOwner: { firstName: string; lastName: string } | null = null;
        if (protocol.systemOwnerId) {
            const owner = await prisma.user.findUnique({
                where: { id: protocol.systemOwnerId },
                select: { firstName: true, lastName: true },
            });
            systemOwner = owner;
        }

        // Generate HTML content for PDF
        const html = generateProtocolHTML(protocol, systemOwner);

        // Return HTML that can be printed to PDF by browser
        return new NextResponse(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Disposition": `inline; filename="${encodeURIComponent(protocol.systemName || protocol.systemCode)}-protokoll.html"`,
            },
        });
    } catch (error) {
        console.error("PDF export error:", error);
        return NextResponse.json(
            { error: "Kunne ikke eksportere protokoll" },
            { status: 500 }
        );
    }
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        NOT_STARTED: "Ikke startet",
        IN_PROGRESS: "Pågår",
        COMPLETED: "Fullført",
        NA: "Ikke aktuelt",
        DEVIATION: "Avvik",
    };
    return labels[status] || status;
}

function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
        NOT_STARTED: "#9ca3af",
        IN_PROGRESS: "#f59e0b",
        COMPLETED: "#22c55e",
        NA: "#6b7280",
        DEVIATION: "#ef4444",
    };
    return colors[status] || "#9ca3af";
}

function generateProtocolHTML(
    protocol: any,
    systemOwner: { firstName: string; lastName: string } | null
): string {
    // Calculate progress based on all columns A, B, C being COMPLETED
    const completedCount = protocol.items.filter((i: any) =>
        i.columnA === "COMPLETED" && i.columnB === "COMPLETED" && i.columnC === "COMPLETED"
    ).length;
    const totalCount = protocol.items.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const systemOwnerName = systemOwner
        ? `${systemOwner.firstName} ${systemOwner.lastName}`
        : "-";
    const periodStart = protocol.startTime
        ? format(new Date(protocol.startTime), "dd.MM.yyyy", { locale: nb })
        : "-";
    const periodEnd = protocol.endTime
        ? format(new Date(protocol.endTime), "dd.MM.yyyy", { locale: nb })
        : "-";

    // Column descriptions for header
    const columnDescriptions = {
        A: "Montasje",
        B: "Merket",
        C: "Koblet",
        D: "Komponent",
        F: "Ansvarlig",
        G: "Utførende",
        H: "Dato",
    };

    return `
<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MC Protokoll - ${protocol.systemName || protocol.systemCode}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
            line-height: 1.4;
            color: #1f2937;
            padding: 20px;
        }
        .header {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 16px;
            margin-bottom: 20px;
        }
        .header h1 { 
            font-size: 20px; 
            color: #1e3a8a;
            margin-bottom: 4px;
        }
        .header .subtitle { 
            color: #6b7280;
            font-size: 12px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 20px;
            padding: 12px;
            background: #f8fafc;
            border-radius: 8px;
        }
        .info-item label {
            display: block;
            font-size: 9px;
            text-transform: uppercase;
            color: #6b7280;
            margin-bottom: 2px;
        }
        .info-item span {
            font-weight: 600;
        }
        .progress-bar {
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        .progress-fill {
            height: 100%;
            background: #22c55e;
        }
        .column-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 12px;
            font-size: 9px;
            color: #6b7280;
        }
        .column-legend span {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .column-legend strong {
            color: #1f2937;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
        }
        th {
            background: #f1f5f9;
            padding: 6px 4px;
            text-align: center;
            font-weight: 600;
            border-bottom: 2px solid #cbd5e1;
            border-right: 1px solid #e5e7eb;
        }
        th:last-child { border-right: none; }
        td {
            padding: 6px 4px;
            border-bottom: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
            vertical-align: middle;
            text-align: center;
        }
        td:last-child { border-right: none; }
        td.text-left { text-align: left; }
        tr:nth-child(even) { background: #fafafa; }
        .status-cell {
            font-weight: 600;
            font-size: 8px;
            padding: 2px;
        }
        .status-completed { color: #16a34a; }
        .status-not-started { color: #9ca3af; }
        .status-in-progress { color: #f59e0b; }
        .status-deviation { color: #dc2626; }
        .status-na { color: #6b7280; }
        .signature-section {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
        .signature-grid {
            display: flex;
            gap: 40px;
            margin-top: 30px;
        }
        .signature-box {
            flex: 1;
        }
        .signature-box .label {
            font-weight: 600;
            margin-bottom: 20px;
        }
        .signature-line {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }
        .signature-line span {
            white-space: nowrap;
        }
        .signature-line .underline {
            flex: 1;
            border-bottom: 1px solid #333;
            min-width: 120px;
        }
        .footer {
            margin-top: 30px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
            font-size: 9px;
            color: #6b7280;
            text-align: center;
        }
        @media print {
            body { padding: 10px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>MC Protokoll: ${protocol.systemName || protocol.systemCode}</h1>
        <p class="subtitle">Prosjekt: ${protocol.project?.name || "-"}</p>
    </div>

    <div class="info-grid">
        <div class="info-item">
            <label>Systemkode</label>
            <span>${protocol.systemCode}</span>
        </div>
        <div class="info-item">
            <label>Systemeier</label>
            <span>${systemOwnerName}</span>
        </div>
        <div class="info-item">
            <label>Periode</label>
            <span>${periodStart} - ${periodEnd}</span>
        </div>
        <div class="info-item">
            <label>Status</label>
            <span>${getStatusLabel(protocol.status)}</span>
        </div>
        <div class="info-item">
            <label>Fremdrift</label>
            <span>${completedCount} / ${totalCount} (${progress}%)</span>
        </div>
        <div class="info-item">
            <label>Opprettet</label>
            <span>${format(new Date(protocol.createdAt), "dd.MM.yyyy", { locale: nb })}</span>
        </div>
    </div>

    <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%"></div>
    </div>

    <div class="column-legend">
        <span><strong>A:</strong> ${columnDescriptions.A}</span>
        <span><strong>B:</strong> ${columnDescriptions.B}</span>
        <span><strong>C:</strong> ${columnDescriptions.C}</span>
        <span><strong>D:</strong> ${columnDescriptions.D}</span>
        <span><strong>F:</strong> ${columnDescriptions.F}</span>
        <span><strong>G:</strong> ${columnDescriptions.G}</span>
        <span><strong>H:</strong> ${columnDescriptions.H}</span>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 18%">TFM-kode</th>
                <th style="width: 5%">A</th>
                <th style="width: 5%">B</th>
                <th style="width: 5%">C</th>
                <th style="width: 15%">D - Komponent</th>
                <th style="width: 12%">F - Ansvarlig</th>
                <th style="width: 12%">G - Utførende</th>
                <th style="width: 8%">H - Dato</th>
                <th style="width: 20%">Notater</th>
            </tr>
        </thead>
        <tbody>
            ${protocol.items.map((item: any) => {
        const getStatusClass = (status: string) => {
            switch (status) {
                case "COMPLETED": return "status-completed";
                case "IN_PROGRESS": return "status-in-progress";
                case "DEVIATION": return "status-deviation";
                case "NA": return "status-na";
                default: return "status-not-started";
            }
        };
        const getStatusSymbol = (status: string) => {
            switch (status) {
                case "COMPLETED": return "✓";
                case "IN_PROGRESS": return "◐";
                case "DEVIATION": return "✗";
                case "NA": return "—";
                default: return "○";
            }
        };

        return `
            <tr>
                <td class="text-left">
                    <strong>${item.massList?.tfm || "-"}</strong>
                    ${item.massList?.productName ? `<br/><small style="color: #6b7280">${item.massList.productName}</small>` : ""}
                </td>
                <td class="status-cell ${getStatusClass(item.columnA)}">${getStatusSymbol(item.columnA)}</td>
                <td class="status-cell ${getStatusClass(item.columnB)}">${getStatusSymbol(item.columnB)}</td>
                <td class="status-cell ${getStatusClass(item.columnC)}">${getStatusSymbol(item.columnC)}</td>
                <td class="text-left">${item.massList?.component || "-"}</td>
                <td>${item.responsible ? `${item.responsible.firstName} ${item.responsible.lastName}` : "-"}</td>
                <td>${item.executor ? `${item.executor.firstName} ${item.executor.lastName}` : "-"}</td>
                <td>${item.completedAt ? format(new Date(item.completedAt), "dd.MM.yy", { locale: nb }) : "-"}</td>
                <td class="text-left" style="font-size: 8px;">${item.notes || "-"}</td>
            </tr>
            `;
    }).join("")}
        </tbody>
    </table>

    <div class="signature-section">
        <div class="signature-grid">
            <div class="signature-box">
                <div class="label">Systemeier</div>
                <div class="signature-line">
                    <span>Dato:</span>
                    <div class="underline"></div>
                    <span>Signatur:</span>
                    <div class="underline" style="min-width: 180px;"></div>
                </div>
            </div>
            <div class="signature-box">
                <div class="label">Kontrollør</div>
                <div class="signature-line">
                    <span>Dato:</span>
                    <div class="underline"></div>
                    <span>Signatur:</span>
                    <div class="underline" style="min-width: 180px;"></div>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Eksportert fra SysFlyt ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })}</p>
    </div>

    <script class="no-print">
        // Auto-print when opened
        window.onload = () => {
            setTimeout(() => window.print(), 500);
        };
    </script>
</body>
</html>
    `.trim();
}
