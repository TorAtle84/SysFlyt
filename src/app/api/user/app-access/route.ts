import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * GET - Get user's app access
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                appAccess: {
                    where: { status: "APPROVED" },
                    select: {
                        application: { select: { code: true } }
                    }
                }
            }
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        const apps = user.appAccess.map(a => a.application.code);

        return NextResponse.json({ apps });

    } catch (error) {
        console.error("Error fetching app access:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente app-tilgang" },
            { status: 500 }
        );
    }
}
