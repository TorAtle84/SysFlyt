import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import { requireProjectAccess, requireProjectLeaderAccess, canUploadDocuments } from "@/lib/auth-helpers";
import { validateFileName, validateFileSize } from "@/lib/file-utils";

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

    if (!file) {
      return NextResponse.json({ error: "Fil er påkrevd" }, { status: 400 });
    }

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
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    const entries = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      entries.push({
        projectId,
        typeCode: String(row[0] || ""),
        description: String(row[1] || ""),
        tfm: row[2] ? String(row[2]) : null,
        building: row[3] ? String(row[3]) : null,
        system: row[4] ? String(row[4]) : null,
        component: row[5] ? String(row[5]) : null,
        productName: row[6] ? String(row[6]) : null,
        location: row[7] ? String(row[7]) : null,
        zone: row[8] ? String(row[8]) : null,
      });
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Ingen gyldige rader funnet i filen" },
        { status: 400 }
      );
    }

    await prisma.massList.createMany({
      data: entries,
    });

    return NextResponse.json({ count: entries.length }, { status: 201 });
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
    } else {
      return NextResponse.json(
        { error: "ID eller all-parameter er påkrevd" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting mass list:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
