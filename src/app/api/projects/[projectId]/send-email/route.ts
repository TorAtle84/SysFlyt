import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { sendProtocolEmail } from "@/lib/email";

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

        // Get item info based on type
        let itemName: string;
        let itemUrl: string;

        if (itemType === "MC_PROTOCOL") {
            const protocol = await prisma.mCProtocol.findUnique({
                where: { id: itemId, projectId },
                select: { systemCode: true, systemName: true },
            });

            if (!protocol) {
                return NextResponse.json(
                    { error: "Protokoll ikke funnet" },
                    { status: 404 }
                );
            }

            itemName = protocol.systemName || protocol.systemCode;
            itemUrl = `${process.env.NEXTAUTH_URL}/projects/${projectId}/protocols/${itemId}`;
        } else {
            const functionTest = await prisma.functionTest.findUnique({
                where: { id: itemId, projectId },
                select: { systemCode: true, systemName: true },
            });

            if (!functionTest) {
                return NextResponse.json(
                    { error: "Funksjonstest ikke funnet" },
                    { status: 404 }
                );
            }

            itemName = functionTest.systemName || functionTest.systemCode;
            itemUrl = `${process.env.NEXTAUTH_URL}/projects/${projectId}/protocols/function-tests/${itemId}`;
        }

        // Send email
        await sendProtocolEmail(
            recipientEmail,
            recipientName,
            senderName,
            itemType,
            itemName,
            project.name,
            itemUrl
        );

        return NextResponse.json({ success: true, message: "E-post sendt" });
    } catch (error) {
        console.error("Error sending email:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Kunne ikke sende e-post" },
            { status: 500 }
        );
    }
}
