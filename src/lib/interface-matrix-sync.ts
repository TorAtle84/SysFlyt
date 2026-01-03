/**
 * Interface Matrix Sync Logic
 * 
 * Handles synchronization of Interface Matrix data between linked
 * SysLink (Project) and FlytLink (KravsporingProject) projects.
 * 
 * Merge Strategy:
 * - Rows (Systems): Combine unique system codes, keep most complete description
 * - Columns (Disciplines): Add missing disciplines from both sides
 * - Cells: For each row+column, merge values keeping unique entries
 * - Sorting: Rows are always sorted by systemCode (numeric)
 */

import prisma from "@/lib/db";

interface SyncResult {
    success: boolean;
    rowsAdded: number;
    rowsUpdated: number;
    columnsAdded: number;
    cellsUpdated: number;
    error?: string;
}

/**
 * Synchronize Interface Matrix between a SysLink Project and its linked FlytLink KravsporingProject
 * 
 * @param sourceProjectId - The project ID where the change originated
 * @param sourceType - "SYSLINK" or "FLYTLINK"
 */
export async function syncInterfaceMatrix(
    sourceProjectId: string,
    sourceType: "SYSLINK" | "FLYTLINK"
): Promise<SyncResult> {
    try {
        // Find the source and linked project
        let sysLinkProjectId: string | null = null;
        let flytLinkProjectId: string | null = null;
        let sourceMatrix: Awaited<ReturnType<typeof getMatrixWithData>> | null = null;
        let targetMatrix: Awaited<ReturnType<typeof getMatrixWithData>> | null = null;

        if (sourceType === "SYSLINK") {
            const project = await prisma.project.findUnique({
                where: { id: sourceProjectId },
                include: {
                    linkedKravsporingProject: true,
                    interfaceMatrix: {
                        include: {
                            rows: { include: { cells: true }, orderBy: { sortOrder: "asc" } },
                            columns: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                },
            });

            if (!project || !project.linkedKravsporingProject) {
                return { success: false, rowsAdded: 0, rowsUpdated: 0, columnsAdded: 0, cellsUpdated: 0, error: "No linked project found" };
            }

            sysLinkProjectId = project.id;
            flytLinkProjectId = project.linkedKravsporingProject.id;
            sourceMatrix = project.interfaceMatrix;

            // Get or create FlytLink matrix
            targetMatrix = await getOrCreateKravsporingMatrix(flytLinkProjectId);
        } else {
            // Source is FlytLink
            const kProject = await prisma.kravsporingProject.findUnique({
                where: { id: sourceProjectId },
                include: {
                    linkedProject: true,
                    interfaceMatrix: {
                        include: {
                            rows: { include: { cells: true }, orderBy: { sortOrder: "asc" } },
                            columns: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                },
            });

            if (!kProject || !kProject.linkedProject) {
                return { success: false, rowsAdded: 0, rowsUpdated: 0, columnsAdded: 0, cellsUpdated: 0, error: "No linked project found" };
            }

            sysLinkProjectId = kProject.linkedProject.id;
            flytLinkProjectId = kProject.id;
            sourceMatrix = kProject.interfaceMatrix;

            // Get or create SysLink matrix
            targetMatrix = await getOrCreateProjectMatrix(sysLinkProjectId);
        }

        if (!sourceMatrix || !targetMatrix) {
            return { success: false, rowsAdded: 0, rowsUpdated: 0, columnsAdded: 0, cellsUpdated: 0, error: "Could not find or create matrices" };
        }

        // Perform the merge
        const result = await mergeMatrices(sourceMatrix, targetMatrix, sourceType);

        // Update sync metadata on both matrices
        const now = new Date();
        await prisma.interfaceMatrix.updateMany({
            where: { id: { in: [sourceMatrix.id, targetMatrix.id] } },
            data: {
                lastSyncedAt: now,
                lastSyncedFrom: sourceType,
            },
        });

        return result;
    } catch (error) {
        console.error("Error syncing interface matrix:", error);
        return {
            success: false,
            rowsAdded: 0,
            rowsUpdated: 0,
            columnsAdded: 0,
            cellsUpdated: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

async function getMatrixWithData(matrixId: string) {
    return prisma.interfaceMatrix.findUnique({
        where: { id: matrixId },
        include: {
            rows: { include: { cells: true }, orderBy: { sortOrder: "asc" } },
            columns: { orderBy: { sortOrder: "asc" } },
        },
    });
}

async function getOrCreateProjectMatrix(projectId: string) {
    let matrix = await prisma.interfaceMatrix.findUnique({
        where: { projectId },
        include: {
            rows: { include: { cells: true }, orderBy: { sortOrder: "asc" } },
            columns: { orderBy: { sortOrder: "asc" } },
        },
    });

    if (!matrix) {
        matrix = await prisma.interfaceMatrix.create({
            data: { projectId },
            include: {
                rows: { include: { cells: true } },
                columns: true,
            },
        });
        // Create default columns
        await createDefaultColumns(matrix.id);
        matrix = await getMatrixWithData(matrix.id);
    }

    return matrix;
}

async function getOrCreateKravsporingMatrix(kravsporingProjectId: string) {
    let matrix = await prisma.interfaceMatrix.findUnique({
        where: { kravsporingProjectId },
        include: {
            rows: { include: { cells: true }, orderBy: { sortOrder: "asc" } },
            columns: { orderBy: { sortOrder: "asc" } },
        },
    });

    if (!matrix) {
        matrix = await prisma.interfaceMatrix.create({
            data: { kravsporingProjectId },
            include: {
                rows: { include: { cells: true } },
                columns: true,
            },
        });
        // Create default columns
        await createDefaultColumns(matrix.id);
        matrix = await getMatrixWithData(matrix.id);
    }

    return matrix;
}

async function createDefaultColumns(matrixId: string) {
    const defaultDisciplines = [
        { code: "EL", color: "#FEF9C3" },
        { code: "AUT", color: "#E9D5FF" },
        { code: "VENT", color: "#DCFCE7" },
        { code: "RØR", color: "#DBEAFE" },
        { code: "BH", color: "#F3F4F6" },
        { code: "ENT", color: "#FFEDD5" },
        { code: "KUL", color: "#E0F2FE" },
    ];

    await prisma.interfaceMatrixColumn.createMany({
        data: defaultDisciplines.map((d, index) => ({
            matrixId,
            discipline: d.code,
            color: d.color,
            sortOrder: index,
        })),
    });
}

type MatrixWithData = NonNullable<Awaited<ReturnType<typeof getMatrixWithData>>>;

async function mergeMatrices(
    source: MatrixWithData,
    target: MatrixWithData,
    sourceType: "SYSLINK" | "FLYTLINK"
): Promise<SyncResult> {
    let rowsAdded = 0;
    let rowsUpdated = 0;
    let columnsAdded = 0;
    let cellsUpdated = 0;

    // 1. Merge columns - add any missing disciplines to target
    const targetDisciplines = new Set(target.columns.map(c => c.discipline || c.customLabel));
    const maxTargetColSort = Math.max(0, ...target.columns.map(c => c.sortOrder));

    for (const sourceCol of source.columns) {
        const colKey = sourceCol.discipline || sourceCol.customLabel;
        if (colKey && !targetDisciplines.has(colKey)) {
            await prisma.interfaceMatrixColumn.create({
                data: {
                    matrixId: target.id,
                    discipline: sourceCol.discipline,
                    customLabel: sourceCol.customLabel,
                    color: sourceCol.color,
                    sortOrder: maxTargetColSort + columnsAdded + 1,
                },
            });
            columnsAdded++;
        }
    }

    // Re-fetch target columns after adding
    const updatedTargetColumns = await prisma.interfaceMatrixColumn.findMany({
        where: { matrixId: target.id },
    });

    // Build column mapping: discipline/customLabel -> columnId
    const targetColMap = new Map<string, string>();
    for (const col of updatedTargetColumns) {
        const key = col.discipline || col.customLabel || col.id;
        targetColMap.set(key, col.id);
    }

    const sourceColMap = new Map<string, string>();
    for (const col of source.columns) {
        const key = col.discipline || col.customLabel || col.id;
        sourceColMap.set(key, col.id);
    }

    // 2. Merge rows - add missing systems, update descriptions if more complete
    const targetRowMap = new Map<string, typeof target.rows[number]>();
    for (const row of target.rows) {
        targetRowMap.set(row.systemCode, row);
    }

    let maxTargetRowSort = Math.max(0, ...target.rows.map(r => r.sortOrder));

    for (const sourceRow of source.rows) {
        const existingRow = targetRowMap.get(sourceRow.systemCode);

        if (!existingRow) {
            // Add new row
            const newRow = await prisma.interfaceMatrixRow.create({
                data: {
                    matrixId: target.id,
                    systemCode: sourceRow.systemCode,
                    description: sourceRow.description,
                    sortOrder: ++maxTargetRowSort,
                    sourceApp: sourceType,
                },
            });

            // Copy cells for this row
            for (const sourceCell of sourceRow.cells) {
                const sourceColKey = source.columns.find(c => c.id === sourceCell.columnId);
                if (!sourceColKey) continue;
                const targetColId = targetColMap.get(sourceColKey.discipline || sourceColKey.customLabel || "");
                if (!targetColId) continue;

                const cellValues = sourceCell.values as string[] | null;
                if (cellValues && cellValues.length > 0) {
                    await prisma.interfaceMatrixCell.create({
                        data: {
                            rowId: newRow.id,
                            columnId: targetColId,
                            values: cellValues,
                        },
                    });
                    cellsUpdated++;
                }
            }

            rowsAdded++;
        } else {
            // Row exists - check if we should update description (keep most complete)
            const shouldUpdateDesc =
                (!existingRow.description && sourceRow.description) ||
                (sourceRow.description && existingRow.description && sourceRow.description.length > existingRow.description.length);

            if (shouldUpdateDesc) {
                await prisma.interfaceMatrixRow.update({
                    where: { id: existingRow.id },
                    data: { description: sourceRow.description },
                });
                rowsUpdated++;
            }

            // Merge cells - combine values
            for (const sourceCell of sourceRow.cells) {
                const sourceColKey = source.columns.find(c => c.id === sourceCell.columnId);
                if (!sourceColKey) continue;
                const targetColId = targetColMap.get(sourceColKey.discipline || sourceColKey.customLabel || "");
                if (!targetColId) continue;

                const existingCell = existingRow.cells.find(c => c.columnId === targetColId);
                const sourceValues = (sourceCell.values as string[]) || [];

                if (!existingCell) {
                    // Create new cell
                    if (sourceValues.length > 0) {
                        await prisma.interfaceMatrixCell.create({
                            data: {
                                rowId: existingRow.id,
                                columnId: targetColId,
                                values: sourceValues,
                            },
                        });
                        cellsUpdated++;
                    }
                } else {
                    // Merge values (keep unique)
                    const existingValues = (existingCell.values as string[]) || [];
                    const mergedValues = Array.from(new Set([...existingValues, ...sourceValues]));

                    if (mergedValues.length > existingValues.length) {
                        await prisma.interfaceMatrixCell.update({
                            where: { id: existingCell.id },
                            data: { values: mergedValues },
                        });
                        cellsUpdated++;
                    }
                }
            }
        }
    }

    // 3. Re-sort all rows by systemCode (numeric)
    const allTargetRows = await prisma.interfaceMatrixRow.findMany({
        where: { matrixId: target.id },
        orderBy: { systemCode: "asc" },
    });

    // Sort numerically
    allTargetRows.sort((a, b) => {
        const aParts = a.systemCode.split(/[.:]/);
        const bParts = b.systemCode.split(/[.:]/);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aNum = parseInt(aParts[i] || '0', 10);
            const bNum = parseInt(bParts[i] || '0', 10);
            if (aNum !== bNum) return aNum - bNum;
        }
        return 0;
    });

    // Update sort orders
    for (let i = 0; i < allTargetRows.length; i++) {
        if (allTargetRows[i].sortOrder !== i) {
            await prisma.interfaceMatrixRow.update({
                where: { id: allTargetRows[i].id },
                data: { sortOrder: i },
            });
        }
    }

    return {
        success: true,
        rowsAdded,
        rowsUpdated,
        columnsAdded,
        cellsUpdated,
    };
}

/**
 * Initial sync when projects are first linked
 * Merges both matrices into each other (bidirectional)
 */
export async function initialLinkSync(
    sysLinkProjectId: string,
    flytLinkProjectId: string
): Promise<SyncResult> {
    // First sync SysLink -> FlytLink
    const result1 = await syncInterfaceMatrix(sysLinkProjectId, "SYSLINK");

    // Then sync FlytLink -> SysLink (will add any unique items from FlytLink)
    const result2 = await syncInterfaceMatrix(flytLinkProjectId, "FLYTLINK");

    return {
        success: result1.success && result2.success,
        rowsAdded: result1.rowsAdded + result2.rowsAdded,
        rowsUpdated: result1.rowsUpdated + result2.rowsUpdated,
        columnsAdded: result1.columnsAdded + result2.columnsAdded,
        cellsUpdated: result1.cellsUpdated + result2.cellsUpdated,
        error: result1.error || result2.error,
    };
}
