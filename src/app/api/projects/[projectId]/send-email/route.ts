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
                                select: { tfm: true, component: true },
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

            // Generate PDF
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
                    status: item.columnA,
                    responsible: item.responsible
                        ? `${item.responsible.firstName} ${item.responsible.lastName}`
                        : null,
                    executor: item.executor
                        ? `${item.executor.firstName} ${item.executor.lastName}`
                        : null,
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

            // Generate PDF
            pdfBuffer = await generateFunctionTestPDF({
                systemCode: functionTest.systemCode,
                systemName: functionTest.systemName,
                systemOwner: systemOwnerName,
                projectName: project.name,
                rows: functionTest.rows.map((row) => ({
                    systemPart: row.systemPart,
                    function: row.function,
                    status: row.status,
                    assignedTo: row.assignedTo
                        ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`
                        : null,
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
