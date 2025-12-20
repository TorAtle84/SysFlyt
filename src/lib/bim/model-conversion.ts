import path from "path";
import { writeFile } from "fs/promises";
import prisma from "@/lib/db";
import { ModelStatus, ModelFormat } from "@prisma/client";
import {
  ensureModelConvertedDir,
  getModelArtifactRelativePath,
  getModelOriginalRelativePath,
  getUploadsPathApiPath,
  getUploadsPathFsPath,
} from "./bim-file-utils";
import { extractComponentsFromIfcFile } from "./ifc-extract";

type Vec3 = { x: number; y: number; z: number };
type BoundingBox = { min: Vec3; max: Vec3 };

async function safeUpdateConversionProgress(modelId: string, progressPercent: number, stage: string) {
  try {
    await prisma.bimModel.update({
      where: { id: modelId },
      data: {
        metadata: {
          progress: {
            percent: Math.max(0, Math.min(100, Math.round(progressPercent))),
            stage,
          },
          updatedAt: new Date().toISOString(),
        } as any,
      },
    });
  } catch {
    // Ignore missing/deleted model, or transient DB issues (conversion is best-effort).
  }
}

function computeMockPlacement(index: number, systemIndex: number): { position: Vec3; box: BoundingBox } {
  // Spread systems apart to make "system focus" visually clear.
  const systemSpacing = 60;
  const baseZ = systemIndex * systemSpacing;

  const col = index % 20;
  const row = Math.floor(index / 20);

  const position: Vec3 = { x: col * 2.5, y: 0, z: baseZ + row * 2.5 };
  const half = 0.6;
  const box: BoundingBox = {
    min: { x: position.x - half, y: position.y - half, z: position.z - half },
    max: { x: position.x + half, y: position.y + half, z: position.z + half },
  };

  return { position, box };
}

export async function convertBimModelInBackground(params: { projectId: string; modelId: string }): Promise<void> {
  const { projectId, modelId } = params;

  // Fire-and-forget wrapper that always updates status on failure.
  void (async () => {
    try {
      const model = await prisma.bimModel.findFirst({
        where: { id: modelId, projectId },
        select: {
          id: true,
          projectId: true,
          fileName: true,
          format: true,
        },
      });

      if (!model) return;

      await prisma.bimModel.update({
        where: { id: modelId },
        data: { status: ModelStatus.CONVERTING, errorMessage: null },
      });
      await safeUpdateConversionProgress(modelId, 5, "Starter konvertering");

      const ext = path.extname(model.fileName).toLowerCase();
      const originalRelativePath = getModelOriginalRelativePath(modelId, ext);
      const originalFsPath = getUploadsPathFsPath(projectId, originalRelativePath);

      if (model.format !== ModelFormat.IFC) {
        await prisma.bimModel.update({
          where: { id: modelId },
          data: {
            status: ModelStatus.ERROR,
            errorMessage: "Konvertering støtter foreløpig kun IFC-filer",
            metadata: {
              progress: { percent: 0, stage: "Feil" },
              updatedAt: new Date().toISOString(),
            } as any,
          },
        });
        return;
      }

      await safeUpdateConversionProgress(modelId, 15, "Leser IFC");
      const extracted = await extractComponentsFromIfcFile({ filePath: originalFsPath });
      await safeUpdateConversionProgress(modelId, 45, "Ekstraherer komponenter");

      // Deterministic ordering for stable placements
      extracted.sort((a, b) => a.fullTag.localeCompare(b.fullTag));

      const systems = Array.from(new Set(extracted.map((c) => c.systemCode))).sort((a, b) =>
        a.localeCompare(b)
      );
      const systemIndexMap = new Map(systems.map((s, idx) => [s, idx]));

      await safeUpdateConversionProgress(modelId, 60, "Lagrer komponenter");
      await prisma.bimModelComponent.deleteMany({ where: { modelId } });

      const componentsForDb = extracted.map((c, idx) => {
        const systemIndex = systemIndexMap.get(c.systemCode) ?? 0;
        const placement = computeMockPlacement(idx, systemIndex);
        return {
          modelId,
          systemCode: c.systemCode,
          componentTag: c.componentTag,
          fullTag: c.fullTag,
          ifcGuid: c.ifcGuid || null,
          ifcType: c.ifcType || null,
          name: c.name || null,
          floor: null,
          position: placement.position,
          boundingBox: placement.box,
          properties: {
            source: c.source,
          },
        };
      });

      if (componentsForDb.length > 0) {
        await prisma.bimModelComponent.createMany({
          data: componentsForDb,
          skipDuplicates: true,
        });
      }

      await safeUpdateConversionProgress(modelId, 75, "Genererer viewer-data");
      const convertedDirFs = await ensureModelConvertedDir({ projectId, modelId });

      const componentsArtifact = {
        generatedAt: new Date().toISOString(),
        modelId,
        systems,
        count: componentsForDb.length,
        components: componentsForDb.map((c) => ({
          systemCode: c.systemCode,
          componentTag: c.componentTag,
          fullTag: c.fullTag,
          ifcGuid: c.ifcGuid,
          ifcType: c.ifcType,
          name: c.name,
          floor: c.floor,
          position: c.position,
          boundingBox: c.boundingBox,
        })),
      };

      const metadataArtifact = {
        generatedAt: new Date().toISOString(),
        modelId,
        progress: { percent: 100, stage: "Klar" },
        stats: {
          components: componentsForDb.length,
          systems: systems.length,
        },
        artifacts: {
          components: getUploadsPathApiPath(projectId, getModelArtifactRelativePath(modelId, "components.json")),
          metadata: getUploadsPathApiPath(projectId, getModelArtifactRelativePath(modelId, "metadata.json")),
        },
      };

      await writeFile(path.join(convertedDirFs, "components.json"), JSON.stringify(componentsArtifact, null, 2), "utf8");
      await writeFile(path.join(convertedDirFs, "metadata.json"), JSON.stringify(metadataArtifact, null, 2), "utf8");

      const componentsUrl = metadataArtifact.artifacts.components;

      await prisma.bimModel.update({
        where: { id: modelId },
        data: {
          status: ModelStatus.READY,
          storagePath: componentsUrl,
          metadata: metadataArtifact as any,
        },
      });
    } catch (error) {
      console.error("Model conversion error:", error);
      try {
        await prisma.bimModel.update({
          where: { id: modelId },
          data: {
            status: ModelStatus.ERROR,
            errorMessage: "Konvertering feilet",
            metadata: {
              progress: { percent: 0, stage: "Feil" },
              updatedAt: new Date().toISOString(),
            } as any,
          },
        });
      } catch (innerError) {
        console.error("Failed updating model status after conversion error:", innerError);
      }
    }
  })();
}
