import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { sendProtocolEmail } from "@/lib/email";
import { generateMCProtocolPDF, generateFunctionTestPDF } from "@/lib/pdf-generator";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const body = await request.json();
        const { itemType, itemId, recipientEmail, recipientUserId } = body;

        if (!itemType || !itemId || !recipientEmail) {
            return NextResponse.json(
                { error: "Mangler påkrevde felter" },
                { status: 400 }
            );
        }

        // Validate item type
        if (!["MC_PROTOCOL", "FUNCTION_TEST"].includes(itemType)) {
            return NextResponse.json(
                { error: "Ugyldig elementtype" },
                { status: 400 }
            );
        }

        // Get sender info
        const sender = authResult.user;
        const senderName = `${sender.firstName} ${sender.lastName}`;

        // Get recipient name if user ID provided
        let recipientName: string | null = null;
        if (recipientUserId) {
            const recipient = await prisma.user.findUnique({
                where: { id: recipientUserId },
                select: { firstName: true, lastName: true },
            });
            if (recipient) {
                recipientName = recipient.firstName;
            }
        }

        // Get project info
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });

        if (!project) {
            return NextResponse.json(
                { error: "Prosjekt ikke funnet" },
                { status: 404 }
            );
        }

        // Get item info and generate PDF based on type
        let itemName: string;
        let pdfBuffer: Buffer;

        if (itemType === "MC_PROTOCOL") {
            const protocol = await prisma.mCProtocol.findUnique({
                where: { id: itemId, projectId },
                include: {
                    items: {
                        include: {
                            responsible: {
                                select: { firstName: true, lastName: true },
                            },
                            executor: {
                                select: { firstName: true, lastName: true },
                            },
                            massList: {
                                select: { tfm: true, component: true, productName: true },
                            },
                        },
                        orderBy: { createdAt: "asc" },
                    },
                },
            });

            if (!protocol) {
                return NextResponse.json(
                    { error: "Protokoll ikke funnet" },
                    { status: 404 }
                );
            }

            // Fetch system owner separately
            let systemOwnerName: string | null = null;
            if (protocol.systemOwnerId) {
                const owner = await prisma.user.findUnique({
                    where: { id: protocol.systemOwnerId },
                    select: { firstName: true, lastName: true },
                });
                if (owner) {
                    systemOwnerName = `${owner.firstName} ${owner.lastName}`;
                }
            }

            itemName = protocol.systemName || protocol.systemCode;

            // Generate PDF with all required fields
            pdfBuffer = await generateMCProtocolPDF({
                systemCode: protocol.systemCode,
                systemName: protocol.systemName,
                systemOwner: systemOwnerName,
                startTime: protocol.startTime,
                endTime: protocol.endTime,
                status: protocol.status,
                projectName: project.name,
                createdAt: protocol.createdAt,
                items: protocol.items.map((item) => ({
                    tfmCode: item.massList?.tfm || "",
                    component: item.massList?.component || "",
                    productName: item.massList?.productName || undefined,
                    columnA: item.columnA,
                    columnB: item.columnB,
                    columnC: item.columnC,
                    responsible: item.responsible
                        ? `${item.responsible.firstName} ${item.responsible.lastName}`
                        : null,
                    executor: item.executor
                        ? `${item.executor.firstName} ${item.executor.lastName}`
                        : null,
                    completedAt: item.completedAt,
                    notes: item.notes,
                })),
            });
        } else {
            const functionTest = await prisma.functionTest.findUnique({
                where: { id: itemId, projectId },
                include: {
                    rows: {
                        include: {
                            assignedTo: {
                                select: { firstName: true, lastName: true },
                            },
                        },
                        orderBy: { sortOrder: "asc" },
                    },
                    responsibles: {
                        include: {
                            user: {
                                select: { firstName: true, lastName: true },
                            },
                        },
                    },
                },
            });

            if (!functionTest) {
                return NextResponse.json(
                    { error: "Funksjonstest ikke funnet" },
                    { status: 404 }
                );
            }

            // Fetch system owner separately
            let systemOwnerName: string | null = null;
            if (functionTest.systemOwnerId) {
                const owner = await prisma.user.findUnique({
                    where: { id: functionTest.systemOwnerId },
                    select: { firstName: true, lastName: true },
                });
                if (owner) {
                    systemOwnerName = `${owner.firstName} ${owner.lastName}`;
                }
            }

            itemName = functionTest.systemName || functionTest.systemCode;

            // Parse dates from functionTest.dates
            let startDate: Date | null = null;
            const dates = functionTest.dates as Record<string, unknown> | null;
            if (dates && typeof dates === "object") {
                // Try funksjonstest phase first
                const funksjontestDates = dates["funksjonstest"] as Record<string, unknown> | undefined;
                if (funksjontestDates && funksjontestDates["start"]) {
                    startDate = new Date(funksjontestDates["start"] as string);
                } else if (dates["start"]) {
                    startDate = new Date(dates["start"] as string);
                }
            }

            // Generate PDF with all required fields
            pdfBuffer = await generateFunctionTestPDF({
                systemCode: functionTest.systemCode,
                systemName: functionTest.systemName,
                systemOwner: systemOwnerName,
                projectName: project.name,
                startDate,
                responsibles: functionTest.responsibles.map((r) => ({
                    systemCode: r.systemCode,
                    discipline: r.discipline,
                    userName: r.user
                        ? `${r.user.firstName} ${r.user.lastName}`
                        : null,
                })),
                rows: functionTest.rows.map((row) => ({
                    systemPart: row.systemPart,
                    function: row.function,
                    testExecution: row.testExecution || "",
                    acceptanceCriteria: row.acceptanceCriteria || "",
                    status: row.status,
                    completedDate: row.completedDate,
                    category: row.category,
                })),
            });
        }

        // Send email with PDF attachment
        await sendProtocolEmail(
            recipientEmail,
            recipientName,
            senderName,
            itemType,
            itemName,
            project.name,
            pdfBuffer
        );

        return NextResponse.json({ success: true, message: "E-post sendt med PDF-vedlegg" });
    } catch (error) {
        console.error("Error sending email:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Kunne ikke sende e-post" },
            { status: 500 }
        );
    }
}
