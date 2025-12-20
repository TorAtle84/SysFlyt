export type BimModelListItem = {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  format: "IFC" | "RVT" | "BIM";
  status: "UPLOADING" | "CONVERTING" | "READY" | "ERROR";
  errorMessage?: string | null;
  originalPath: string;
  storagePath?: string | null;
  createdAt: string;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
  _count?: { components: number };
};

