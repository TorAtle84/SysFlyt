import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { ids, disciplineId, status } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "Ingen krav-ID-er oppgitt" }, { status: 400 });
        }

        const updateData: { disciplineId?: string | null; status?: string } = {};

        if (disciplineId !== undefined) {
            updateData.disciplineId = disciplineId;
        }
        if (status) {
            updateData.status = status;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "Ingen data å oppdatere" }, { status: 400 });
        }

        await prisma.kravsporingRequirement.updateMany({
            where: {
                id: { in: ids },
            },
            data: updateData,
        });

        return NextResponse.json({ success: true, updated: ids.length });
    } catch (error) {
        console.error("Error updating requirements:", error);
        return NextResponse.json({ error: "Kunne ikke oppdatere krav" }, { status: 500 });
    }
}
