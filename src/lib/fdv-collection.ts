export type FdvSystemEntry = {
  code: string;
  name?: string | null;
};

export type FdvManifestFile = {
  id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
};

export type FdvComponentFileRef = {
  fileId: string;
  docType: string;
};

export type FdvManifestComponent = {
  id: string;
  tfm?: string | null;
  systemCode?: string | null;
  systemName?: string | null;
  name: string;
  productName?: string | null;
  supplierName?: string | null;
  files: FdvComponentFileRef[];
};

export type FdvMissingComponent = {
  id: string;
  systemCode?: string | null;
  name: string;
};

export type FdvSummary = {
  componentsTotal: number;
  componentsWithFDV: number;
  componentsMissingFDV: number;
  filesTotal: number;
};

export type FdvManifest = {
  schemaVersion: string;
  exportedAt: string;
  project: { id: string; name: string };
  summary: FdvSummary & { exportedWithMissing: boolean };
  systems?: FdvSystemEntry[];
  files: FdvManifestFile[];
  components: FdvManifestComponent[];
  missingComponents: FdvMissingComponent[];
};

export type FdvComponentCoverage = {
  id: string;
  systemCode?: string | null;
  name: string;
  hasFdv: boolean;
};

export function dedupeFdvFiles(files: FdvManifestFile[]): FdvManifestFile[] {
  const seen = new Set<string>();
  const unique: FdvManifestFile[] = [];

  for (const file of files) {
    const key = file.sha256 || file.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }

  return unique;
}

export function buildFdvSummary(
  components: FdvComponentCoverage[],
  filesTotal: number
): { summary: FdvSummary; missingComponents: FdvMissingComponent[] } {
  const componentsTotal = components.length;
  const componentsWithFDV = components.filter((c) => c.hasFdv).length;
  const componentsMissingFDV = componentsTotal - componentsWithFDV;

  const missingComponents = components
    .filter((c) => !c.hasFdv)
    .map((c) => ({
      id: c.id,
      systemCode: c.systemCode ?? null,
      name: c.name,
    }));

  return {
    summary: {
      componentsTotal,
      componentsWithFDV,
      componentsMissingFDV,
      filesTotal,
    },
    missingComponents,
  };
}

export function buildFdvManifest(args: {
  project: { id: string; name: string };
  components: FdvManifestComponent[];
  files: FdvManifestFile[];
  missingComponents: FdvMissingComponent[];
  summary: FdvSummary;
  exportedWithMissing: boolean;
  exportedAt?: string;
  systems?: FdvSystemEntry[];
}): FdvManifest {
  const uniqueFiles = dedupeFdvFiles(args.files);
  const exportedAt = args.exportedAt || new Date().toISOString();

  return {
    schemaVersion: "1.0",
    exportedAt,
    project: args.project,
    summary: {
      ...args.summary,
      filesTotal: uniqueFiles.length,
      exportedWithMissing: args.exportedWithMissing,
    },
    systems: args.systems,
    files: uniqueFiles,
    components: args.components,
    missingComponents: args.missingComponents,
  };
}
