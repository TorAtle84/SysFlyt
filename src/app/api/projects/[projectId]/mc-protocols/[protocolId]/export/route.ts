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
            },
        });

        if (!protocol) {
            return NextResponse.json(
                { error: "Protokoll ikke funnet" },
                { status: 404 }
            );
        }

        // Generate HTML content for PDF
        const html = generateProtocolHTML(protocol);

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

function generateProtocolHTML(protocol: any): string {
    const completedCount = protocol.items.filter((i: any) => i.status === "COMPLETED").length;
    const totalCount = protocol.items.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
            grid-template-columns: repeat(4, 1fr);
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
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
        }
        th {
            background: #f1f5f9;
            padding: 8px 6px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #cbd5e1;
        }
        td {
            padding: 8px 6px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
        }
        tr:nth-child(even) { background: #fafafa; }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 600;
            color: white;
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

    <table>
        <thead>
            <tr>
                <th style="width: 20%">TFM-kode</th>
                <th style="width: 15%">Komponent</th>
                <th style="width: 15%">Status</th>
                <th style="width: 15%">Ansvarlig</th>
                <th style="width: 15%">Utførende</th>
                <th style="width: 10%">Dato</th>
                <th style="width: 10%">Notater</th>
            </tr>
        </thead>
        <tbody>
            ${protocol.items.map((item: any) => {
        const colAStatus = item.columnA;
        const colBStatus = item.columnB;
        const colCStatus = item.columnC;
        // Determine overall status
        const allCompleted = colAStatus === "COMPLETED" && colBStatus === "COMPLETED" && colCStatus === "COMPLETED";
        const hasDeviation = colAStatus === "DEVIATION" || colBStatus === "DEVIATION" || colCStatus === "DEVIATION";
        const anyInProgress = colAStatus === "IN_PROGRESS" || colBStatus === "IN_PROGRESS" || colCStatus === "IN_PROGRESS";
        const displayStatus = hasDeviation ? "DEVIATION" : allCompleted ? "COMPLETED" : anyInProgress ? "IN_PROGRESS" : "NOT_STARTED";

        return `
            <tr>
                <td>
                    <strong>${item.massList?.tfm || "-"}</strong>
                    ${item.massList?.productName ? `<br/><small style="color: #6b7280">${item.massList.productName}</small>` : ""}
                </td>
                <td>${item.massList?.component || "-"}</td>
                <td>
                    <span class="status-badge" style="background: ${getStatusColor(displayStatus)}">
                        ${getStatusLabel(displayStatus)}
                    </span>
                </td>
                <td>${item.responsible ? `${item.responsible.firstName} ${item.responsible.lastName}` : "-"}</td>
                <td>${item.executor ? `${item.executor.firstName} ${item.executor.lastName}` : "-"}</td>
                <td>${item.completedAt ? format(new Date(item.completedAt), "dd.MM.yyyy", { locale: nb }) : "-"}</td>
                <td>${item.notes || "-"}</td>
            </tr>
            `;
    }).join("")}
        </tbody>
    </table>

    <div class="footer">
        <p>Generert ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })} - SysLink</p>
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
