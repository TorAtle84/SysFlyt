import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import { z } from "zod";
import { requireProjectAccess, requireProjectLeaderAccess, canUploadDocuments } from "@/lib/auth-helpers";
import { validateFileName, validateFileSize } from "@/lib/file-utils";
import { parseTFM } from "@/lib/tfm-id";

// Zod schema for column mapping validation
const MappingSchema = z.object({
  tfm: z.string().optional(),
  productName: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  zone: z.string().nullable().optional(),
});

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

    const massList = await prisma.massList.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(massList);
  } catch (error) {
    console.error("Error fetching mass list:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
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

    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: authResult.user.id },
    });

    if (!canUploadDocuments(authResult.user.role, membership?.role)) {
      return NextResponse.json(
        { error: "Ingen tilgang til å laste opp masselister" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingJson = formData.get("mapping") as string;

    if (!file || !mappingJson) {
      return NextResponse.json(
        { error: "Fil og kolonnemapping er påkrevd" },
        { status: 400 }
      );
    }

    // Validate mapping
    let mapping;
    try {
      const parsedMapping = JSON.parse(mappingJson);
      mapping = MappingSchema.parse(parsedMapping);
    } catch (err) {
      return NextResponse.json(
        { error: "Ugyldig kolonnemapping" },
        { status: 400 }
      );
    }

    if (!mapping.tfm) {
      return NextResponse.json(
        { error: "TFM-kolonne er påkrevd" },
        { status: 400 }
      );
    }

    // Validate file
    const fileNameValidation = validateFileName(file.name);
    if (!fileNameValidation.valid) {
      return NextResponse.json({ error: fileNameValidation.error }, { status: 400 });
    }

    if (fileNameValidation.type !== "spreadsheet") {
      return NextResponse.json(
        { error: "Kun Excel-filer (.xlsx, .xls) er tillatt for masselister" },
        { status: 400 }
      );
    }

    const validMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!validMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Ugyldig filtype. Kun Excel-filer er tillatt." },
        { status: 400 }
      );
    }

    const fileSizeValidation = validateFileSize(file.size, "spreadsheet");
    if (!fileSizeValidation.valid) {
      return NextResponse.json({ error: fileSizeValidation.error }, { status: 400 });
    }

    // Parse Excel file
    const buffer = Buffer.from(await file.arrayBuffer());

    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        { error: "Kunne ikke lese Excel-filen. Sjekk at formatet er korrekt." },
        { status: 400 }
      );
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON with column letters as keys
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: "A" }) as Record<
      string,
      unknown
    >[];

    // Parse and validate entries
    const entries = [];
    let skipped = 0;

    for (const row of jsonData) {
      // Get TFM value from mapped column
      const tfmRaw = mapping.tfm ? row[mapping.tfm]?.toString() : undefined;

      if (!tfmRaw || !tfmRaw.trim()) {
        skipped++;
        continue; // Skip empty TFM rows
      }

      // Parse TFM code
      const parsed = parseTFM(tfmRaw);

      if (!parsed) {
        console.log(`Skipping invalid TFM: ${tfmRaw}`);
        skipped++;
        continue; // Skip invalid TFM format
      }

      // Extract optional fields based on mapping
      const productName = mapping.productName
        ? row[mapping.productName]?.toString() || null
        : null;

      const supplierName = mapping.supplierName
        ? row[mapping.supplierName]?.toString() || null
        : null;

      const location = mapping.location
        ? row[mapping.location]?.toString() || null
        : null;

      const zone = mapping.zone ? row[mapping.zone]?.toString() || null : null;

      // Create entry
      entries.push({
        projectId,
        tfm: tfmRaw.trim(),
        building: parsed.building,
        system: parsed.system,
        component: parsed.component,
        typeCode: parsed.typeCode,
        productName,
        supplierName,
        location,
        zone,
        description: null,
      });
    }

    if (entries.length === 0) {
      return NextResponse.json(
        {
          error: `Ingen gyldige rader funnet i filen. ${skipped} rader ble hoppet over.`,
        },
        { status: 400 }
      );
    }

    // Save to database
    await prisma.massList.createMany({
      data: entries,
    });

    return NextResponse.json(
      {
        count: entries.length,
        skipped,
        message: `${entries.length} oppføringer lastet opp. ${skipped} rader hoppet over.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading mass list:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectLeaderAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    if (all === "true") {
      await prisma.massList.deleteMany({
        where: { projectId },
      });
      return NextResponse.json({ success: true, message: "Alle oppføringer slettet" });
    } else if (id) {
      const entry = await prisma.massList.findFirst({
        where: { id, projectId },
      });

      if (!entry) {
        return NextResponse.json(
          { error: "Oppføring ikke funnet" },
          { status: 404 }
        );
      }

      await prisma.massList.delete({
        where: { id },
      });

      return NextResponse.json({ success: true, message: "Oppføring slettet" });
    } else {
      return NextResponse.json(
        { error: "ID eller all-parameter er påkrevd" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error deleting mass list:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
