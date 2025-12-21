/**
 * Individual Comparison API
 * GET: Download comparison Excel file
 * DELETE: Delete comparison
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET_NAME = "documents";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; comparisonId: string }> }
) {
    try {
        const { projectId, comparisonId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const comparison = await prisma.tfmComparison.findUnique({
            where: { id: comparisonId, projectId },
        });

        if (!comparison) {
            return NextResponse.json(
                { error: "Sammenligning ikke funnet" },
                { status: 404 }
            );
        }

        // Extract storage path from fileUrl
        const proxyMatch = comparison.fileUrl.match(/^\/api\/files\/(.+)$/);
        if (!proxyMatch) {
            return NextResponse.json(
                { error: "Ugyldig fil-URL" },
                { status: 500 }
            );
        }

        const storagePath = proxyMatch[1];

        // Download from Supabase
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(storagePath);

        if (error || !data) {
            console.error("Download error:", error);
            return NextResponse.json(
                { error: "Kunne ikke hente fil" },
                { status: 500 }
            );
        }

        const buffer = Buffer.from(await data.arrayBuffer());

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(comparison.name)}.xlsx"`,
            },
        });
    } catch (error) {
        console.error("Error getting comparison:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente sammenligning" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; comparisonId: string }> }
) {
    try {
        const { projectId, comparisonId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const comparison = await prisma.tfmComparison.findUnique({
            where: { id: comparisonId, projectId },
        });

        if (!comparison) {
            return NextResponse.json(
                { error: "Sammenligning ikke funnet" },
                { status: 404 }
            );
        }

        // Delete from Supabase Storage
        const proxyMatch = comparison.fileUrl.match(/^\/api\/files\/(.+)$/);
        if (proxyMatch) {
            const storagePath = proxyMatch[1];
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
        }

        // Delete from database
        await prisma.tfmComparison.delete({
            where: { id: comparisonId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting comparison:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette sammenligning" },
            { status: 500 }
        );
    }
}
