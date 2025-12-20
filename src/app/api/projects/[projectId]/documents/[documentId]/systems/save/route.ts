import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { SystemRole } from "@prisma/client";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const { projectId, documentId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const body = await request.json();
        const { systems, primarySystem } = body;

        if (!Array.isArray(systems)) {
            return NextResponse.json(
                { error: "Systems array is required" },
                { status: 400 }
            );
        }

        await prisma.$transaction(async (tx) => {
            // 1. Update document primary system
            await tx.document.update({
                where: { id: documentId },
                data: { primarySystem: primarySystem || null },
            });

            // 2. Ensure all system tags exist
            for (const sys of systems) {
                if (!sys.code) continue;
                await tx.systemTag.upsert({
                    where: { code: sys.code },
                    create: { code: sys.code },
                    update: {},
                });
            }

            // 3. Get all tag IDs
            const codes = systems.map((s: any) => s.code).filter(Boolean);
            const tags = await tx.systemTag.findMany({
                where: { code: { in: codes } },
            });
            const tagMap = new Map(tags.map((t) => [t.code, t.id]));

            // 4. Replace document system tags
            await tx.documentSystemTag.deleteMany({
                where: { documentId },
            });

            if (systems.length > 0) {
                const data = systems
                    .map((sys: any, index: number) => {
                        const tagId = tagMap.get(sys.code);
                        if (!tagId) return null;
                        // Determine role: first system or explicitly marked as PRIMARY gets PRIMARY role
                        const role = sys.role === "PRIMARY" || (index === 0 && !sys.role)
                            ? SystemRole.PRIMARY
                            : SystemRole.DELANSVARLIG;
                        return {
                            documentId,
                            systemTagId: tagId,
                            order: typeof sys.order === 'number' ? sys.order : index,
                            role,
                        };
                    })
                    .filter((item): item is NonNullable<typeof item> => item !== null);

                if (data.length > 0) {
                    await tx.documentSystemTag.createMany({
                        data,
                    });
                }
            }

            // 5. Update flat string array for legacy support/easier access
            await tx.document.update({
                where: { id: documentId },
                data: { systemTags: codes },
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving systems:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
