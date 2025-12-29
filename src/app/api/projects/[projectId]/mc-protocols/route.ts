import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

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

        const protocols = await prisma.mCProtocol.findMany({
            where: { projectId },
            orderBy: { systemCode: "asc" },
            include: {
                items: {
                    select: {
                        columnA: true,
                        columnB: true,
                        columnC: true,
                    },
                },
            },
        });

        // Calculate progress for each protocol
        const protocolsWithProgress = protocols.map((p) => {
            const totalItems = p.items.length;
            const completedItems = p.items.filter(
                (i) =>
                    (i.columnA === "COMPLETED" || i.columnA === "NA") &&
                    (i.columnB === "COMPLETED" || i.columnB === "NA") &&
                    (i.columnC === "COMPLETED" || i.columnC === "NA")
            ).length;

            const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

            // Omit items from response to keep payload size down
            const { items, ...protocolData } = p;

            // Override status: if progress is 0, show as NOT_STARTED
            const derivedStatus = progress === 0 ? "NOT_STARTED" : protocolData.status;

            return {
                ...protocolData,
                status: derivedStatus,
                stats: {
                    totalItems,
                    completedItems,
                    progress,
                },
            };
        });

        return NextResponse.json({ protocols: protocolsWithProgress });
    } catch (error) {
        console.error("Error fetching protocols:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente protokoller" },
            { status: 500 }
        );
    }
}

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

        // Fetch project creator to use as default value for responsibleId
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { createdById: true },
        });
        const defaultResponsibleId = project?.createdById;

        // Parse body
        let systemTags: string[] = [];
        let documentId: string | undefined;

        try {
            const body = await request.json();
            if (body && Array.isArray(body.systemTags)) {
                systemTags = body.systemTags;
            }
            if (body && body.documentId) {
                documentId = body.documentId;
            }
        } catch (e) {
            // Body error
        }

        // Preload predefined function tests so we can auto-create Funksjonstest per system
        // without requiring a separate "generate" step.
        const predefinedFunctionTests = await prisma.predefinedFunctionTest.findMany({
            where: { isActive: true },
            orderBy: [
                { systemGroup: "asc" },
                { systemType: "asc" },
                { function: "asc" },
                { category: "asc" },
            ],
        }).catch(() => []);

        // 1. Fetch Document Components (The Source of Truth)
        // If documentId is provided, scan only that document.
        // If NOT provided (Global Generate), scan ALL documents in the project.

        let whereClause: any = {};

        if (documentId) {
            whereClause = { documentId };
        } else {
            whereClause = {
                document: {
                    projectId: projectId
                }
            };
        }

        const docComponents = await prisma.documentComponent.findMany({
            where: {
                ...whereClause
            }
        });



        console.log(`[MC-PROTO] Found ${docComponents.length} total components`);

        // 2. Group by System
        const componentsBySystem: Record<string, typeof docComponents> = {};

        docComponents.forEach(comp => {
            let systemCode = comp.system;
            let baseSystemCode = systemCode;

            // Fallback: Try to extract system from TFM code (e.g. =3601.009-JVZ0025 -> 3601.009)
            if (!systemCode && comp.code && comp.code.startsWith("=")) {
                const parts = comp.code.split("-");
                if (parts.length > 1) {
                    systemCode = parts[0].substring(1); // Remove leading '='
                    baseSystemCode = systemCode;
                }
            }

            // Strip suffix for grouping (e.g. 3601.001:04 -> 3601.001)
            if (systemCode && systemCode.includes(":")) {
                baseSystemCode = systemCode.split(":")[0];
            }

            if (baseSystemCode && comp.code) {
                if (!componentsBySystem[baseSystemCode]) {
                    componentsBySystem[baseSystemCode] = [];
                }
                componentsBySystem[baseSystemCode].push(comp);
            }
        });

        let createdProtocols = 0;
        let createdItems = 0;

        // 3. Process each System group
        for (const [baseSystemCode, components] of Object.entries(componentsBySystem)) {
            // Create/Get Protocol (using Base System Code)
            const protocol = await prisma.mCProtocol.upsert({
                where: {
                    projectId_systemCode: {
                        projectId,
                        systemCode: baseSystemCode,
                    },
                },
                update: {},
                create: {
                    projectId,
                    systemCode: baseSystemCode,
                    systemName: `System ${baseSystemCode}`,
                    status: "IN_PROGRESS",
                },
            });

            if (protocol.createdAt.getTime() === protocol.updatedAt.getTime()) {
                createdProtocols++;
            }

            // Auto-create/update Function Test (Funksjonstest) for this system
            if (predefinedFunctionTests.length > 0) {
                const functionTest = await prisma.functionTest.upsert({
                    where: {
                        projectId_systemCode: {
                            projectId,
                            systemCode: baseSystemCode,
                        },
                    },
                    update: {},
                    create: {
                        projectId,
                        systemCode: baseSystemCode,
                        systemName: protocol.systemName || `System ${baseSystemCode}`,
                    },
                });

                const existingRows = await prisma.functionTestRow.findMany({
                    where: {
                        functionTestId: functionTest.id,
                        predefinedTestId: { not: null },
                    },
                    select: { predefinedTestId: true, sortOrder: true },
                });

                const existingTemplateIds = new Set(
                    existingRows.map((r) => r.predefinedTestId).filter((v): v is string => !!v)
                );

                const maxSortOrder = existingRows.length > 0
                    ? Math.max(...existingRows.map((r) => r.sortOrder))
                    : -1;

                let nextSortOrder = maxSortOrder + 1;

                const rowsToCreate = predefinedFunctionTests
                    .filter((t) => !existingTemplateIds.has(t.id))
                    .map((t) => ({
                        functionTestId: functionTest.id,
                        sortOrder: nextSortOrder++,
                        status: "NOT_STARTED" as const,
                        category: t.category,
                        systemPart: t.systemPart,
                        function: t.function,
                        testExecution: t.testExecution,
                        acceptanceCriteria: t.acceptanceCriteria,
                        predefinedTestId: t.id,
                        assignedToId: defaultResponsibleId,
                    }));

                if (rowsToCreate.length > 0) {
                    await prisma.functionTestRow.createMany({
                        data: rowsToCreate,
                        skipDuplicates: true,
                    });
                }
            }

            // Process Components for this System
            for (const comp of components) {
                // We use the SPECIFIC system code for the item (e.g. 3601.001:04)
                const specificSystemCode = comp.system || baseSystemCode;

                // TFM Format requested: =System-Component (e.g. =3200.001-JPA0038)
                // Use specific system code in TFM as well? Usually TFM doesn't have :suffix, 
                // but if the user wants strict separation, maybe we should use specific.
                // However, user said ":04 means special parts of the system".
                // Let's use the specific code for the MassList item to preserve data.
                const tfmCode = `=${specificSystemCode}-${comp.code}`;

                // Try to find existing MassList item first
                let massListItem = await prisma.massList.findFirst({
                    where: {
                        projectId,
                        system: specificSystemCode,
                        component: comp.code
                    }
                });

                // If not found, create it (Per user instruction: "skal inn i sine dedikerte systemer")
                if (!massListItem) {
                    massListItem = await prisma.massList.create({
                        data: {
                            projectId,
                            system: specificSystemCode,
                            component: comp.code,
                            tfm: tfmCode,
                            description: `Generert fra PDF (DokID: ${comp.documentId})`,
                        }
                    });
                }

                // Create Protocol Item linked to this MassList item
                const existingItem = await prisma.mCProtocolItem.findUnique({
                    where: {
                        protocolId_massListId: {
                            protocolId: protocol.id,
                            massListId: massListItem.id,
                        },
                    },
                });

                if (!existingItem) {
                    await prisma.mCProtocolItem.create({
                        data: {
                            protocolId: protocol.id,
                            massListId: massListItem.id,
                            columnA: "NOT_STARTED",
                            columnB: "NOT_STARTED",
                            columnC: "NOT_STARTED",
                            responsibleId: defaultResponsibleId,
                        },
                    });
                    createdItems++;
                } else if (!existingItem.responsibleId && defaultResponsibleId) {
                    await prisma.mCProtocolItem.update({
                        where: { id: existingItem.id },
                        data: { responsibleId: defaultResponsibleId }
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Opprettet/Oppdaterte ${createdProtocols} protokoller med ${createdItems} nye punkter fra ${docComponents.length} komponenter.`,
            count: createdProtocols
        });
    } catch (error: any) {
        console.error("Error generating protocols:", error);
        return NextResponse.json(
            { error: "Kunne ikke generere protokoller: " + (error.message || "Ukjent feil") },
            { status: 500 }
        );
    }
}
