import {
  buildFdvManifest,
  buildFdvSummary,
  dedupeFdvFiles,
  type FdvManifestComponent,
  type FdvManifestFile,
} from "../fdv-collection";

describe("buildFdvSummary", () => {
  it("returns missing components and summary counts", () => {
    const components = [
      { id: "C-1", systemCode: "360", name: "Komponent 1", hasFdv: true },
      { id: "C-2", systemCode: "360", name: "Komponent 2", hasFdv: false },
      { id: "C-3", systemCode: "420", name: "Komponent 3", hasFdv: true },
    ];

    const { summary, missingComponents } = buildFdvSummary(components, 4);

    expect(summary.componentsTotal).toBe(3);
    expect(summary.componentsWithFDV).toBe(2);
    expect(summary.componentsMissingFDV).toBe(1);
    expect(summary.filesTotal).toBe(4);
    expect(missingComponents).toEqual([
      { id: "C-2", systemCode: "360", name: "Komponent 2" },
    ]);
  });
});

describe("buildFdvManifest", () => {
  it("dedupes files by sha256 and keeps summary in sync", () => {
    const files: FdvManifestFile[] = [
      {
        id: "hash-1",
        path: "datablader/hash-1.pdf",
        name: "A.pdf",
        mime: "application/pdf",
        size: 123,
        sha256: "hash-1",
      },
      {
        id: "hash-1",
        path: "datablader/hash-1.pdf",
        name: "A-copy.pdf",
        mime: "application/pdf",
        size: 123,
        sha256: "hash-1",
      },
    ];

    const components: FdvManifestComponent[] = [
      {
        id: "C-1",
        systemCode: "360",
        name: "Komponent 1",
        files: [{ fileId: "hash-1", docType: "datablad" }],
      },
    ];

    const manifest = buildFdvManifest({
      project: { id: "P-1", name: "Prosjekt" },
      components,
      files,
      missingComponents: [],
      summary: {
        componentsTotal: 1,
        componentsWithFDV: 1,
        componentsMissingFDV: 0,
        filesTotal: 2,
      },
      exportedWithMissing: false,
      exportedAt: "2025-01-01T10:00:00.000Z",
    });

    expect(dedupeFdvFiles(files)).toHaveLength(1);
    expect(manifest.files).toHaveLength(1);
    expect(manifest.summary.filesTotal).toBe(1);
    expect(manifest.exportedAt).toBe("2025-01-01T10:00:00.000Z");
  });
});
