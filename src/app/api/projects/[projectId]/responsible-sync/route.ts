import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

/**
 * GET /api/projects/[projectId]/responsible-sync
 * Get all responsible assignments for a project, grouped by system code
 * This enables cross-module synchronization between Funksjonsbeskrivelse and Funksjonstest
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        // Get all function tests with their responsibles for this project
        const functionTests = await prisma.functionTest.findMany({
            where: { projectId },
            select: {
                id: true,
                systemCode: true,
                systemName: true,
                responsibles: {
                    select: {
                        id: true,
                        systemCode: true,
                        discipline: true,
                        systemOwnerDiscipline: true,
                        testParticipation: true,
                        userId: true,
                        isAutoDetected: true,
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        // Build a map of system code -> responsibles
        const responsiblesBySystem: Record<string, Array<{
            id: string;
            systemCode: string;
            discipline: string;
            systemOwnerDiscipline: string | null;
            testParticipation: string | null;
            userId: string | null;
            userName: string | null;
            sourceType: "FunctionTest";
            sourceId: string;
            sourceName: string | null;
        }>> = {};

        for (const ft of functionTests) {
            for (const resp of ft.responsibles) {
                if (!responsiblesBySystem[resp.systemCode]) {
                    responsiblesBySystem[resp.systemCode] = [];
                }

                responsiblesBySystem[resp.systemCode].push({
                    id: resp.id,
                    systemCode: resp.systemCode,
                    discipline: resp.discipline,
                    systemOwnerDiscipline: resp.systemOwnerDiscipline,
                    testParticipation: resp.testParticipation,
                    userId: resp.userId,
                    userName: resp.user
                        ? `${resp.user.firstName} ${resp.user.lastName}`
                        : null,
                    sourceType: "FunctionTest",
                    sourceId: ft.id,
                    sourceName: ft.systemName,
                });
            }
        }

        return NextResponse.json({
            responsiblesBySystem,
            functionTests: functionTests.map(ft => ({
                id: ft.id,
                systemCode: ft.systemCode,
                systemName: ft.systemName,
                responsibleCount: ft.responsibles.length,
            })),
        });

    } catch (error) {
        console.error("Error fetching responsibles:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente ansvarlige" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/projects/[projectId]/responsible-sync
 * Synchronize responsibles from Funksjonsbeskrivelse to Funksjonstest
 * When a function description identifies responsible parties for a system,
 * this endpoint updates the corresponding function test responsibles
 */
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
        const {
            sourceDocumentId,
            primarySystem,
            responsibles,
        } = body as {
            sourceDocumentId: string;
            primarySystem: string;
            responsibles: Array<{
                systemCode: string;
                discipline: string;
                systemOwnerDiscipline?: string;
                userId?: string;
            }>;
        };

        if (!primarySystem || !responsibles || !Array.isArray(responsibles)) {
            return NextResponse.json(
                { error: "Ugyldig forespørsel" },
                { status: 400 }
            );
        }

        // Find function tests for the systems we have responsibles for
        const systemCodes = [primarySystem, ...responsibles.map(r => r.systemCode)];
        const uniqueSystemCodes = [...new Set(systemCodes)];

        const functionTests = await prisma.functionTest.findMany({
            where: {
                projectId,
                systemCode: { in: uniqueSystemCodes },
            },
            select: {
                id: true,
                systemCode: true,
            },
        });

        const ftBySystemCode = new Map(functionTests.map(ft => [ft.systemCode, ft]));

        let created = 0;
        let updated = 0;

        // Process each responsible entry
        for (const resp of responsibles) {
            const functionTest = ftBySystemCode.get(resp.systemCode);

            if (!functionTest) {
                // No function test exists for this system yet - skip for now
                // It will be picked up when the function test is created
                continue;
            }

            // Check if responsible already exists
            const existing = await prisma.functionTestResponsible.findFirst({
                where: {
                    functionTestId: functionTest.id,
                    systemCode: resp.systemCode,
                    discipline: resp.discipline,
                },
            });

            if (existing) {
                // Update if we have new information
                if (resp.systemOwnerDiscipline || resp.userId) {
                    await prisma.functionTestResponsible.update({
                        where: { id: existing.id },
                        data: {
                            systemOwnerDiscipline: resp.systemOwnerDiscipline || existing.systemOwnerDiscipline,
                            userId: resp.userId || existing.userId,
                        },
                    });
                    updated++;
                }
            } else {
                // Create new responsible entry
                await prisma.functionTestResponsible.create({
                    data: {
                        functionTestId: functionTest.id,
                        systemCode: resp.systemCode,
                        discipline: resp.discipline,
                        systemOwnerDiscipline: resp.systemOwnerDiscipline || null,
                        userId: resp.userId || null,
                        isAutoDetected: true,
                    },
                });
                created++;
            }
        }

        // Store sync metadata on the document
        if (sourceDocumentId) {
            await prisma.document.update({
                where: { id: sourceDocumentId },
                data: {
                    primarySystem,
                    // Could add a metadata field for sync history if needed
                },
            });
        }

        return NextResponse.json({
            success: true,
            primarySystem,
            created,
            updated,
            total: responsibles.length,
        });

    } catch (error) {
        console.error("Error syncing responsibles:", error);
        return NextResponse.json(
            { error: "Kunne ikke synkronisere ansvarlige" },
            { status: 500 }
        );
    }
}
