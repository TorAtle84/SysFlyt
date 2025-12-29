"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar as CalendarIcon,
  ChevronLeft,
  Copy,
  Download,
  Mail,
  MoreVertical,
  FileText,
  ListChecks,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Settings,
  StickyNote,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { normalizeSystemCode } from "@/lib/tfm-id";
import { DISCIPLINES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SendEmailModal } from "@/components/email/send-email-modal";

type FunctionTestRowStatus =
  | "NOT_STARTED"
  | "COMPLETED"
  | "NOT_APPLICABLE"
  | "DEVIATION";

type FunctionTestCategory =
  | "START_STOP"
  | "SECURITY"
  | "REGULATION"
  | "EXTERNAL"
  | "OTHER";

type UploadedFunctionTestDocument = {
  id: string;
  fileName: string;
  url: string;
  uploadedAt: string;
  uploadedById?: string;
};

type UserLite = { id: string; firstName: string; lastName: string };

type FunctionTestResponsible = {
  id: string;
  systemCode: string;
  discipline: string;
  systemOwnerDiscipline: string | null;
  testParticipation: string | null;
  prerequisites: string | null;
  userId: string | null;
  isAutoDetected: boolean;
  user?: UserLite | null;
};

type RowComment = {
  id: string;
  authorId: string;
  createdAt: string;
  content: string;
};

type TestParticipation = "Egentest" | "Funksjonstest" | "Begge";

type FunctionTestRow = {
  id: string;
  sortOrder: number;
  status: FunctionTestRowStatus;
  category: FunctionTestCategory;
  systemPart: string;
  function: string;
  testExecution: string;
  acceptanceCriteria: string;
  responsibleId: string | null;
  discipline: string | null;
  testParticipation: string | null;
  assignedToId: string | null;
  performedById: string | null;
  completedDate: string | Date | null;
  comments: unknown;
  responsible?: FunctionTestResponsible | null;
  assignedTo?: UserLite | null;
  performedBy?: UserLite | null;
};

type TestPhase = "ioTesting" | "egentest" | "funksjonstest";

type PhaseDates = {
  start?: string | null;
  end?: string | null;
};

type FunctionTestDates = {
  start?: string | null;
  end?: string | null;
  // New structure for phase-based dates
  ioTesting?: PhaseDates;
  egentest?: PhaseDates;
  funksjonstest?: PhaseDates;
};

const TEST_PHASES: { value: TestPhase; label: string }[] = [
  { value: "ioTesting", label: "I/O-testing" },
  { value: "egentest", label: "Egentest" },
  { value: "funksjonstest", label: "Funksjonstest" },
];

const TEST_PARTICIPATION_OPTIONS: { value: TestParticipation; label: string }[] = [
  { value: "Egentest", label: "Egentest" },
  { value: "Funksjonstest", label: "Funksjonstest" },
  { value: "Begge", label: "Begge" },
];

type FunctionTestData = {
  id: string;
  systemCode: string;
  systemName?: string | null;
  systemOwnerId?: string | null;
  systemOwnerDiscipline?: string | null;
  softwareResponsible?: string | null;
  dates?: unknown;
  uploadedDocuments?: unknown;
  responsibles?: FunctionTestResponsible[];
  rows?: FunctionTestRow[];
};

type PredefinedFunctionTestTemplate = {
  id: string;
  category: FunctionTestCategory;
  systemGroup: string | null;
  systemType: string | null;
  systemPart: string;
  function: string;
  testExecution: string;
  acceptanceCriteria: string;
};

type PredefinedFunctionTestInput = {
  category: FunctionTestCategory;
  systemGroup: string;
  systemType: string;
  function: string;
  testExecution: string;
  acceptanceCriteria: string;
};

type PredefinedFunctionGroup = {
  systemGroup: string | null;
  systemType: string | null;
  function: string;
  testCount: number;
};

type ImportedFunctionTestRow = {
  systemGroup: string;
  systemType: string;
  functionName: string;
  category: FunctionTestCategory;
  testExecution: string;
  acceptanceCriteria: string;
};

type RowResponsibleFilterValue = "ALL" | "UNASSIGNED" | `ID:${string}`;

interface FunctionTestDetailProps {
  project: { id: string; name: string };
  functionTest: FunctionTestData;
  members: UserLite[];
  userId: string;
  isAdmin?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeComments(value: unknown): RowComment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => {
      if (!isRecord(c)) return null;
      const id = c["id"];
      const authorId = c["authorId"];
      const createdAt = c["createdAt"];
      const content = c["content"];
      if (!id || !authorId || !createdAt || typeof content !== "string") return null;
      return {
        id: String(id),
        authorId: String(authorId),
        createdAt: String(createdAt),
        content,
      } satisfies RowComment;
    })
    .filter((v): v is RowComment => !!v);
}

function formatCategory(category: FunctionTestCategory) {
  switch (category) {
    case "START_STOP":
      return "Start/Stopp";
    case "SECURITY":
      return "Sikkerhet";
    case "REGULATION":
      return "Regulering";
    case "EXTERNAL":
      return "Ekstern";
    default:
      return "Øvrig";
  }
}

function normalizeTemplateSystemGroup(template: PredefinedFunctionTestTemplate) {
  const value = (template.systemGroup || "").trim();
  return value || "Generelt";
}

function normalizeTemplateSystemType(template: PredefinedFunctionTestTemplate) {
  const value = (template.systemType || "").trim();
  if (value) return value;
  const legacy = (template.systemPart || "").trim();
  return legacy || "Ukjent type";
}

function normalizeGroupSystemGroup(group: PredefinedFunctionGroup) {
  const value = (group.systemGroup || "").trim();
  return value || "Generelt";
}

function normalizeGroupSystemType(group: PredefinedFunctionGroup) {
  const value = (group.systemType || "").trim();
  return value || "Ukjent type";
}

function formatTemplateSystemPart(template: PredefinedFunctionTestTemplate) {
  const type = normalizeTemplateSystemType(template);
  return type || normalizeTemplateSystemGroup(template);
}

function normalizeCategoryText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function mapCategoryLabel(value: string): FunctionTestCategory {
  const normalized = normalizeCategoryText(value);
  if (normalized.includes("start") || normalized.includes("stopp")) return "START_STOP";
  if (normalized.includes("sikker") || normalized.includes("brann")) return "SECURITY";
  if (normalized.includes("reguler")) return "REGULATION";
  if (normalized.includes("ekstern")) return "EXTERNAL";
  if (normalized.includes("ovrig") || normalized.includes("annet")) return "OTHER";
  return "OTHER";
}

function statusLabel(status: FunctionTestRowStatus) {
  switch (status) {
    case "COMPLETED":
      return "Fullført";
    case "NOT_APPLICABLE":
      return "I/A";
    case "DEVIATION":
      return "Avvik";
    default:
      return "Ikke startet";
  }
}

function statusBadgeClass(status: FunctionTestRowStatus) {
  switch (status) {
    case "COMPLETED":
      return "bg-green-500/15 text-green-700 border-green-200";
    case "NOT_APPLICABLE":
      return "bg-muted text-muted-foreground border-border";
    case "DEVIATION":
      return "bg-red-500/15 text-red-700 border-red-200";
    default:
      return "bg-secondary text-muted-foreground border-border";
  }
}

const FUNCTION_TEST_STATUSES: readonly FunctionTestRowStatus[] = [
  "NOT_STARTED",
  "COMPLETED",
  "NOT_APPLICABLE",
  "DEVIATION",
];

function isFunctionTestRowStatus(value: string): value is FunctionTestRowStatus {
  return (FUNCTION_TEST_STATUSES as readonly string[]).includes(value);
}

const FUNCTION_TEST_CATEGORIES: readonly FunctionTestCategory[] = [
  "START_STOP",
  "SECURITY",
  "REGULATION",
  "EXTERNAL",
  "OTHER",
];

function isFunctionTestCategory(value: string): value is FunctionTestCategory {
  return (FUNCTION_TEST_CATEGORIES as readonly string[]).includes(value);
}

function parsePredefinedTest(input: Record<string, unknown>): PredefinedFunctionTestTemplate {
  const categoryRaw = String(input["category"] ?? "OTHER");
  const category = isFunctionTestCategory(categoryRaw) ? categoryRaw : "OTHER";

  return {
    id: String(input["id"]),
    category,
    systemGroup: input["systemGroup"] ? String(input["systemGroup"]) : null,
    systemType: input["systemType"] ? String(input["systemType"]) : null,
    systemPart: String(input["systemPart"] ?? ""),
    function: String(input["function"] ?? ""),
    testExecution: String(input["testExecution"] ?? ""),
    acceptanceCriteria: String(input["acceptanceCriteria"] ?? ""),
  };
}

const CATEGORY_ORDER: Record<FunctionTestCategory, number> = {
  START_STOP: 0,
  SECURITY: 1,
  REGULATION: 2,
  EXTERNAL: 3,
  OTHER: 4,
};

function sortPredefinedTests(a: PredefinedFunctionTestTemplate, b: PredefinedFunctionTestTemplate) {
  const groupA = normalizeTemplateSystemGroup(a);
  const groupB = normalizeTemplateSystemGroup(b);
  if (groupA !== groupB) return groupA.localeCompare(groupB, "nb");

  const typeA = normalizeTemplateSystemType(a);
  const typeB = normalizeTemplateSystemType(b);
  if (typeA !== typeB) return typeA.localeCompare(typeB, "nb");

  const functionCompare = a.function.localeCompare(b.function, "nb");
  if (functionCompare !== 0) return functionCompare;

  return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
}

function upsertPredefinedTests(
  tests: PredefinedFunctionTestTemplate[],
  entry: PredefinedFunctionTestTemplate
) {
  const exists = tests.some((t) => t.id === entry.id);
  const next = exists
    ? tests.map((t) => (t.id === entry.id ? entry : t))
    : [...tests, entry];
  return next.sort(sortPredefinedTests);
}

const DEFAULT_ROW_CATEGORY_FILTERS: Record<FunctionTestCategory, boolean> = {
  START_STOP: true,
  SECURITY: true,
  REGULATION: true,
  EXTERNAL: true,
  OTHER: true,
};

function isRowStatusFilterValue(value: string): value is "ALL" | FunctionTestRowStatus {
  return value === "ALL" || isFunctionTestRowStatus(value);
}

function formatUser(u?: UserLite | null) {
  if (!u) return "—";
  return `${u.firstName} ${u.lastName}`.trim();
}

function formatResponsible(r?: FunctionTestResponsible | null) {
  if (!r) return "—";
  const userName = r.user ? ` • ${formatUser(r.user)}` : "";
  return `${r.systemCode} • ${r.discipline}${userName}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function FunctionTestDetail({ project, functionTest, members, userId, isAdmin }: FunctionTestDetailProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminImportInputRef = useRef<HTMLInputElement>(null);
  const responsiblesModalInitializedRef = useRef(false);
  const predefinedTestsInitializedRef = useRef(false);

  const [systemOwnerId, setSystemOwnerId] = useState<string>(functionTest.systemOwnerId || "");
  const [systemOwnerDiscipline, setSystemOwnerDiscipline] = useState<string>(functionTest.systemOwnerDiscipline || "");
  const [softwareResponsible, setSoftwareResponsible] = useState<string>(functionTest.softwareResponsible || "");

  const initialDates = useMemo(() => (isRecord(functionTest.dates) ? functionTest.dates : {}), [functionTest.dates]);

  const [selectedPhase, setSelectedPhase] = useState<TestPhase>("funksjonstest");

  // Helper to get dates for a specific phase
  const getPhaseDates = (phase: TestPhase): { start?: Date; end?: Date } => {
    const phaseData = initialDates[phase];
    if (isRecord(phaseData)) {
      return {
        start: typeof phaseData["start"] === "string" && phaseData["start"] ? new Date(phaseData["start"] as string) : undefined,
        end: typeof phaseData["end"] === "string" && phaseData["end"] ? new Date(phaseData["end"] as string) : undefined,
      };
    }
    // Fallback for old format (just start/end at root level) - only for funksjonstest
    if (phase === "funksjonstest") {
      const start = initialDates["start"];
      const end = initialDates["end"];
      return {
        start: typeof start === "string" && start ? new Date(start) : undefined,
        end: typeof end === "string" && end ? new Date(end) : undefined,
      };
    }
    return {};
  };

  const [phaseDates, setPhaseDates] = useState<Record<TestPhase, { start?: Date; end?: Date }>>(() => ({
    ioTesting: getPhaseDates("ioTesting"),
    egentest: getPhaseDates("egentest"),
    funksjonstest: getPhaseDates("funksjonstest"),
  }));

  // Current phase dates for display
  const startDate = phaseDates[selectedPhase]?.start;
  const endDate = phaseDates[selectedPhase]?.end;

  const [documents, setDocuments] = useState<UploadedFunctionTestDocument[]>(
    Array.isArray(functionTest.uploadedDocuments) ? functionTest.uploadedDocuments : []
  );

  const [responsibles, setResponsibles] = useState<FunctionTestResponsible[]>(
    functionTest.responsibles || []
  );

  const [responsiblesDraft, setResponsiblesDraft] = useState<FunctionTestResponsible[]>([]);
  const [responsiblesDraftOriginal, setResponsiblesDraftOriginal] = useState<FunctionTestResponsible[]>([]);
  const [autoDetectState, setAutoDetectState] = useState<{
    loading: boolean;
    schemaTitle?: string;
    message?: string;
    error?: string;
  }>({ loading: false });

  const [rows, setRows] = useState<FunctionTestRow[]>(functionTest.rows || []);
  const [rowStatusFilter, setRowStatusFilter] = useState<"ALL" | FunctionTestRowStatus>("ALL");
  const [rowCategoryFilters, setRowCategoryFilters] = useState<Record<FunctionTestCategory, boolean>>(() => ({
    ...DEFAULT_ROW_CATEGORY_FILTERS,
  }));
  const [rowResponsibleFilter, setRowResponsibleFilter] = useState<RowResponsibleFilterValue>("ALL");
  const [rowActionsOpenId, setRowActionsOpenId] = useState<string | null>(null);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [predefinedTestsLoading, setPredefinedTestsLoading] = useState(false);
  const [predefinedTests, setPredefinedTests] = useState<PredefinedFunctionTestTemplate[]>([]);
  const [predefinedListLoading, setPredefinedListLoading] = useState(false);
  const [predefinedList, setPredefinedList] = useState<PredefinedFunctionGroup[]>([]);
  const [predefinedListTotal, setPredefinedListTotal] = useState(0);
  const [predefinedListPage, setPredefinedListPage] = useState(1);
  const predefinedListPageSize = 10;
  const [predefinedListFilters, setPredefinedListFilters] = useState({
    systemGroup: "",
    systemType: "",
    functionName: "",
  });
  const [templatePickerRow, setTemplatePickerRow] = useState<FunctionTestRow | null>(null);
  const [templatePickerSystem, setTemplatePickerSystem] = useState("");
  const [templatePickerType, setTemplatePickerType] = useState("");
  const [templatePickerFunction, setTemplatePickerFunction] = useState("");
  const [templatePickerSearch, setTemplatePickerSearch] = useState("");

  const [responsiblesOpen, setResponsiblesOpen] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState<FunctionTestRow | null>(null);
  const [editExecution, setEditExecution] = useState("");
  const [editAcceptance, setEditAcceptance] = useState("");
  const [commentDraft, setCommentDraft] = useState("");

  const [newResponsibleSystemCode, setNewResponsibleSystemCode] = useState("");
  const [newResponsibleDiscipline, setNewResponsibleDiscipline] = useState("");

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [deviationDialogRow, setDeviationDialogRow] = useState<FunctionTestRow | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<FunctionTestRow | null>(null);

  // PDF Export
  const [exportValidationOpen, setExportValidationOpen] = useState(false);
  const [exportValidationIssues, setExportValidationIssues] = useState<string[]>([]);
  const [exportValidationWarnings, setExportValidationWarnings] = useState<string[]>([]);

  // Send to other systems modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendTargetSystems, setSendTargetSystems] = useState<{ id: string; systemCode: string; systemName: string | null }[]>([]);
  const [sendTargetSystemsLoading, setSendTargetSystemsLoading] = useState(false);
  const [sendSelectedSystemIds, setSendSelectedSystemIds] = useState<Set<string>>(new Set());

  const templateTree = useMemo(() => {
    const tree = new Map<string, Map<string, Map<string, PredefinedFunctionTestTemplate[]>>>();
    for (const template of predefinedTests) {
      const group = normalizeTemplateSystemGroup(template);
      const type = normalizeTemplateSystemType(template);
      const functionName = template.function.trim() || "Ukjent funksjon";
      const groupMap = tree.get(group) ?? new Map();
      const typeMap = groupMap.get(type) ?? new Map();
      const list = typeMap.get(functionName) ?? [];
      list.push(template);
      typeMap.set(functionName, list);
      groupMap.set(type, typeMap);
      tree.set(group, groupMap);
    }

    for (const groupMap of tree.values()) {
      for (const typeMap of groupMap.values()) {
        for (const [fn, list] of typeMap.entries()) {
          typeMap.set(
            fn,
            list.slice().sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category])
          );
        }
      }
    }

    return tree;
  }, [predefinedTests]);

  const templateSystemOptions = useMemo(
    () => Array.from(templateTree.keys()).sort((a, b) => a.localeCompare(b, "nb")),
    [templateTree]
  );

  const templateTypeOptions = useMemo(() => {
    const map = templateTree.get(templatePickerSystem);
    if (!map) return [];
    return Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "nb"));
  }, [templateTree, templatePickerSystem]);

  const templateFunctionOptions = useMemo(() => {
    const map = templateTree.get(templatePickerSystem)?.get(templatePickerType);
    if (!map) return [];
    const query = templatePickerSearch.trim().toLowerCase();
    const items = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "nb"));
    if (!query) return items;
    return items.filter((fn) => fn.toLowerCase().includes(query));
  }, [templateTree, templatePickerSystem, templatePickerType, templatePickerSearch]);

  const templateEntriesForFunction = useMemo(() => {
    const map = templateTree.get(templatePickerSystem)?.get(templatePickerType);
    return map?.get(templatePickerFunction) ?? [];
  }, [templateTree, templatePickerSystem, templatePickerType, templatePickerFunction]);

  // Admin modal state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminPredefinedTests, setAdminPredefinedTests] = useState<PredefinedFunctionTestTemplate[]>([]);
  const [adminPredefinedTestsLoading, setAdminPredefinedTestsLoading] = useState(false);
  const [adminEditingTest, setAdminEditingTest] = useState<PredefinedFunctionTestTemplate | null>(null);
  const [adminNewTest, setAdminNewTest] = useState({
    category: "OTHER" as FunctionTestCategory,
    systemGroup: "",
    systemType: "",
    function: "",
    testExecution: "",
    acceptanceCriteria: "",
  });
  const [adminContextFilter, setAdminContextFilter] = useState<{
    systemGroup: string;
    systemType: string;
    functionName: string;
  } | null>(null);
  const [adminImportRows, setAdminImportRows] = useState<ImportedFunctionTestRow[]>([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminSelectedFunction, setAdminSelectedFunction] = useState<PredefinedFunctionGroup | null>(null);
  const adminModalInitializedRef = useRef(false);

  const filteredAdminPredefinedTests = useMemo(() => {
    if (!adminContextFilter) return adminPredefinedTests.slice().sort(sortPredefinedTests);
    const targetFunction = adminContextFilter.functionName.trim().toLowerCase();
    return adminPredefinedTests
      .filter((t) => {
        const groupMatch =
          normalizeTemplateSystemGroup(t) === adminContextFilter.systemGroup;
        const typeMatch =
          normalizeTemplateSystemType(t) === adminContextFilter.systemType;
        const functionMatch =
          t.function.trim().toLowerCase() === targetFunction;
        return groupMatch && typeMatch && functionMatch;
      })
      .sort(sortPredefinedTests);
  }, [adminContextFilter, adminPredefinedTests]);

  // Grouped functions for deduplicated display (ignores category)
  const groupedAdminFunctions = useMemo(() => {
    const query = adminSearchQuery.trim().toLowerCase();
    const groupMap = new Map<string, PredefinedFunctionGroup>();

    for (const test of adminPredefinedTests) {
      const systemGroup = normalizeTemplateSystemGroup(test);
      const systemType = normalizeTemplateSystemType(test);
      const functionName = test.function.trim();
      const key = `${systemGroup}||${systemType}||${functionName}`;

      // Apply search filter
      if (query) {
        const matchesSearch =
          systemGroup.toLowerCase().includes(query) ||
          systemType.toLowerCase().includes(query) ||
          functionName.toLowerCase().includes(query);
        if (!matchesSearch) continue;
      }

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          systemGroup,
          systemType,
          function: functionName,
          testCount: 0,
        });
      }
      const group = groupMap.get(key)!;
      group.testCount++;
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      const groupCmp = (a.systemGroup ?? "").localeCompare(b.systemGroup ?? "", "nb");
      if (groupCmp !== 0) return groupCmp;
      const typeCmp = (a.systemType ?? "").localeCompare(b.systemType ?? "", "nb");
      if (typeCmp !== 0) return typeCmp;
      return a.function.localeCompare(b.function, "nb");
    });
  }, [adminPredefinedTests, adminSearchQuery]);

  const stats = useMemo(() => {
    const totalRows = rows.length;
    const completedRows = rows.filter((r) =>
      ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(r.status)
    ).length;
    const deviationRows = rows.filter((r) => r.status === "DEVIATION").length;
    const progress = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;
    return { totalRows, completedRows, deviationRows, progress };
  }, [rows]);

  const predefinedListTotalPages = Math.max(
    1,
    Math.ceil(predefinedListTotal / predefinedListPageSize)
  );
  const predefinedListStart =
    predefinedListTotal === 0 ? 0 : (predefinedListPage - 1) * predefinedListPageSize + 1;
  const predefinedListEnd =
    predefinedListTotal === 0
      ? 0
      : Math.min(predefinedListTotal, predefinedListPage * predefinedListPageSize);

  const filteredRows = useMemo(() => {
    const responsibleIdFilter =
      rowResponsibleFilter.startsWith("ID:") ? rowResponsibleFilter.slice(3) : null;
    return rows
      .filter((r) => (rowStatusFilter === "ALL" ? true : r.status === rowStatusFilter))
      .filter((r) => rowCategoryFilters[r.category])
      .filter((r) => {
        if (rowResponsibleFilter === "ALL") return true;
        if (rowResponsibleFilter === "UNASSIGNED") return !r.responsibleId;
        return r.responsibleId === responsibleIdFilter;
      })
      .sort((a, b) => {
        const categoryOrderA = CATEGORY_ORDER[a.category];
        const categoryOrderB = CATEGORY_ORDER[b.category];
        if (categoryOrderA !== categoryOrderB) return categoryOrderA - categoryOrderB;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id.localeCompare(b.id);
      });
  }, [rowCategoryFilters, rowResponsibleFilter, rowStatusFilter, rows]);

  function markBusy(key: string, value: boolean) {
    setBusy((prev) => ({ ...prev, [key]: value }));
  }

  function updatePredefinedListFilter(
    key: "systemGroup" | "systemType" | "functionName",
    value: string
  ) {
    setPredefinedListFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setPredefinedListPage(1);
  }

  function resetPredefinedListFilters() {
    setPredefinedListFilters({
      systemGroup: "",
      systemType: "",
      functionName: "",
    });
    setPredefinedListPage(1);
  }

  useEffect(() => {
    if (!responsiblesOpen) {
      responsiblesModalInitializedRef.current = false;
      setAutoDetectState({ loading: false });
      setResponsiblesDraft([]);
      setResponsiblesDraftOriginal([]);
      return;
    }

    if (responsiblesModalInitializedRef.current) return;
    responsiblesModalInitializedRef.current = true;

    setResponsiblesDraftOriginal(responsibles);
    setResponsiblesDraft(responsibles.map((r) => ({ ...r })));
    setAutoDetectState({ loading: true });

    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${project.id}/function-tests/${functionTest.id}/responsibles/auto`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Kunne ikke hente delansvarlige automatisk");
        }

        setAutoDetectState({
          loading: false,
          schemaTitle: data.schemaDocument?.title,
          message: data.message,
        });

        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        if (suggestions.length === 0) return;

        setResponsiblesDraft((prev) => {
          const existing = new Set(prev.map((r) => normalizeSystemCode(r.systemCode)));
          const next = [...prev];

          for (const s of suggestions) {
            if (!isRecord(s)) continue;
            const systemCode = normalizeSystemCode(String(s["systemCode"] ?? ""));
            if (!systemCode || existing.has(systemCode)) continue;

            const discipline = String(s["discipline"] ?? "").trim();
            const systemOwnerUserId = s["systemOwnerUserId"]
              ? String(s["systemOwnerUserId"])
              : null;
            const userNext = systemOwnerUserId
              ? members.find((m) => m.id === systemOwnerUserId) || null
              : null;
            const userIdResolved = userNext ? systemOwnerUserId : null;

            existing.add(systemCode);
            next.push({
              id: `temp_${crypto.randomUUID()}`,
              systemCode,
              discipline,
              systemOwnerDiscipline: null,
              testParticipation: null,
              prerequisites: null,
              userId: userIdResolved,
              user: userNext,
              isAutoDetected: true,
            });
          }

          return next.sort((a, b) => a.systemCode.localeCompare(b.systemCode));
        });
      } catch (e: unknown) {
        setAutoDetectState({
          loading: false,
          error: errorMessage(e, "Kunne ikke hente delansvarlige automatisk"),
        });
      }
    })();
  }, [functionTest.id, members, project.id, responsibles, responsiblesOpen]);

  useEffect(() => {
    if (!templatePickerRow) return;
    if (predefinedTestsInitializedRef.current) return;
    predefinedTestsInitializedRef.current = true;

    (async () => {
      setPredefinedTestsLoading(true);
      try {
        const res = await fetch("/api/function-tests/predefined");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Kunne ikke hente testmaler");
        }
        const tests: unknown[] = Array.isArray(data.tests) ? data.tests : [];
        setPredefinedTests(
          tests
            .filter((t): t is Record<string, unknown> => isRecord(t))
            .map((t) => parsePredefinedTest(t))
        );
      } catch (e: unknown) {
        toast.error(errorMessage(e, "Kunne ikke hente testmaler"));
      } finally {
        setPredefinedTestsLoading(false);
      }
    })();
  }, [templatePickerRow]);

  useEffect(() => {
    if (!addRowOpen) return;

    const controller = new AbortController();

    (async () => {
      setPredefinedListLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(predefinedListPage),
          pageSize: String(predefinedListPageSize),
        });

        const systemGroup = predefinedListFilters.systemGroup.trim();
        const systemType = predefinedListFilters.systemType.trim();
        const functionName = predefinedListFilters.functionName.trim();

        params.set("groupBy", "function");
        if (systemGroup) params.set("systemGroup", systemGroup);
        if (systemType) params.set("systemType", systemType);
        if (functionName) params.set("function", functionName);

        const res = await fetch(`/api/function-tests/predefined?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Kunne ikke hente testmaler");
        }
        const tests: unknown[] = Array.isArray(data.functions) ? data.functions : [];
        setPredefinedList(
          tests
            .filter((t): t is Record<string, unknown> => isRecord(t))
            .map((t) => ({
              systemGroup: t["systemGroup"] ? String(t["systemGroup"]) : null,
              systemType: t["systemType"] ? String(t["systemType"]) : null,
              function: String(t["function"] ?? ""),
              testCount: Number(t["testCount"] ?? 0),
            }))
        );
        const total = Number.isFinite(Number(data.total)) ? Number(data.total) : tests.length;
        setPredefinedListTotal(total);
      } catch (e: unknown) {
        if ((e as { name?: string }).name === "AbortError") return;
        toast.error(errorMessage(e, "Kunne ikke hente testmaler"));
      } finally {
        setPredefinedListLoading(false);
      }
    })();

    return () => controller.abort();
  }, [addRowOpen, predefinedListFilters, predefinedListPage, predefinedListPageSize]);

  useEffect(() => {
    if (!addRowOpen) return;
    if (predefinedListPage > predefinedListTotalPages) {
      setPredefinedListPage(predefinedListTotalPages);
    }
  }, [addRowOpen, predefinedListPage, predefinedListTotalPages]);

  useEffect(() => {
    if (!templatePickerRow || predefinedTests.length === 0) return;

    const match = predefinedTests.find((t) => {
      const functionMatch =
        t.function.trim().toLowerCase() === templatePickerRow.function.trim().toLowerCase();
      if (!functionMatch) return false;
      const typeLabel = normalizeTemplateSystemType(t).toLowerCase();
      const partLabel = (templatePickerRow.systemPart || "").trim().toLowerCase();
      return !partLabel || typeLabel === partLabel;
    });

    const nextSystem = match
      ? normalizeTemplateSystemGroup(match)
      : templateSystemOptions[0] || "";
    const availableTypes = templateTree.get(nextSystem);
    const fallbackType =
      match?.systemType?.trim() ||
      match?.systemPart?.trim() ||
      (availableTypes ? Array.from(availableTypes.keys())[0] : "");
    const availableFunctions = availableTypes?.get(fallbackType);
    const fallbackFunction =
      match?.function ||
      (availableFunctions ? Array.from(availableFunctions.keys())[0] : "");

    setTemplatePickerSystem(nextSystem);
    setTemplatePickerType(fallbackType);
    setTemplatePickerFunction(fallbackFunction);
    setTemplatePickerSearch("");
  }, [predefinedTests, templatePickerRow, templateSystemOptions, templateTree]);

  useEffect(() => {
    if (!templatePickerSystem || templateTypeOptions.length === 0) return;
    if (!templateTypeOptions.includes(templatePickerType)) {
      setTemplatePickerType(templateTypeOptions[0]);
    }
  }, [templatePickerSystem, templateTypeOptions, templatePickerType]);

  useEffect(() => {
    if (!templatePickerType || templateFunctionOptions.length === 0) return;
    if (!templateFunctionOptions.includes(templatePickerFunction)) {
      setTemplatePickerFunction(templateFunctionOptions[0]);
    }
  }, [templatePickerType, templateFunctionOptions, templatePickerFunction]);

  // Admin modal - load predefined tests when opened
  useEffect(() => {
    if (!adminModalOpen) {
      adminModalInitializedRef.current = false;
      setAdminEditingTest(null);
      setAdminNewTest({
        category: "OTHER",
        systemGroup: "",
        systemType: "",
        function: "",
        testExecution: "",
        acceptanceCriteria: "",
      });
      setAdminContextFilter(null);
      setAdminImportRows([]);
      return;
    }

    if (adminModalInitializedRef.current) return;
    adminModalInitializedRef.current = true;

    (async () => {
      setAdminPredefinedTestsLoading(true);
      try {
        const res = await fetch("/api/function-tests/predefined");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke hente testmaler");
        const tests: unknown[] = Array.isArray(data.tests) ? data.tests : [];
        setAdminPredefinedTests(
          tests
            .filter((t): t is Record<string, unknown> => isRecord(t))
            .map((t) => parsePredefinedTest(t))
        );
      } catch (e: unknown) {
        toast.error(errorMessage(e, "Kunne ikke hente testmaler"));
      } finally {
        setAdminPredefinedTestsLoading(false);
      }
    })();
  }, [adminModalOpen]);

  // Send modal - load target systems when opened
  useEffect(() => {
    if (!sendModalOpen) {
      setSendTargetSystems([]);
      setSendSelectedSystemIds(new Set());
      return;
    }

    (async () => {
      setSendTargetSystemsLoading(true);
      try {
        const res = await fetch(`/api/projects/${project.id}/function-tests`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke hente systemer");

        const systems: unknown[] = Array.isArray(data.functionTests) ? data.functionTests : [];
        setSendTargetSystems(
          systems
            .filter((s): s is Record<string, unknown> => isRecord(s))
            .filter((s) => s["id"] !== functionTest.id) // Exclude current system
            .map((s) => ({
              id: String(s["id"]),
              systemCode: String(s["systemCode"] ?? ""),
              systemName: s["systemName"] ? String(s["systemName"]) : null,
            }))
            .sort((a, b) => a.systemCode.localeCompare(b.systemCode))
        );
      } catch (e: unknown) {
        toast.error(errorMessage(e, "Kunne ikke hente systemer"));
      } finally {
        setSendTargetSystemsLoading(false);
      }
    })();
  }, [sendModalOpen, project.id, functionTest.id]);

  async function sendRowsToSystems() {
    const targetIds = Array.from(sendSelectedSystemIds);
    if (targetIds.length === 0) {
      toast.error("Velg minst ett målsystem");
      return;
    }

    if (rows.length === 0) {
      toast.error("Ingen rader å sende");
      return;
    }

    markBusy("send:rows", true);
    try {
      const res = await fetch(`/api/projects/${project.id}/function-tests/${functionTest.id}/rows/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetFunctionTestIds: targetIds,
          rowIds: rows.map((r) => r.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke sende rader");

      toast.success(`${rows.length} rader sendt til ${targetIds.length} system(er)`);
      setSendModalOpen(false);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke sende rader"));
    } finally {
      markBusy("send:rows", false);
    }
  }

  function validateForExport(): { issues: string[]; warnings: string[] } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for incomplete rows
    const incompleteRows = rows.filter((r) => r.status === "NOT_STARTED");
    if (incompleteRows.length > 0) {
      warnings.push(`${incompleteRows.length} testpunkt(er) er ikke startet`);
    }

    // Check for deviation rows without comments
    const deviationRowsWithoutComments = rows.filter((r) => {
      if (r.status !== "DEVIATION") return false;
      const comments = Array.isArray(r.comments) ? r.comments : [];
      return comments.length === 0;
    });
    if (deviationRowsWithoutComments.length > 0) {
      issues.push(`${deviationRowsWithoutComments.length} avvik mangler beskrivelse/kommentar`);
    }

    // Check for completed rows without date
    const completedWithoutDate = rows.filter(
      (r) => ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(r.status) && !r.completedDate
    );
    if (completedWithoutDate.length > 0) {
      warnings.push(`${completedWithoutDate.length} fullførte testpunkt(er) mangler dato`);
    }

    // Check for missing system owner
    if (!systemOwnerId) {
      warnings.push("Systemeier er ikke satt");
    }

    return { issues, warnings };
  }

  function handleExportClick() {
    const { issues, warnings } = validateForExport();

    if (issues.length > 0 || warnings.length > 0) {
      setExportValidationIssues(issues);
      setExportValidationWarnings(warnings);
      setExportValidationOpen(true);
    } else {
      performExport();
    }
  }

  function performExport() {
    setExportValidationOpen(false);

    // Create a new window with print-friendly content
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Kunne ikke åpne utskriftsvindu. Sjekk at popup-blokkere er deaktivert.");
      return;
    }

    const testDate = startDate ? format(startDate, "dd.MM.yyyy") : "-";
    const systemOwnerMember = systemOwnerId ? members.find((m) => m.id === systemOwnerId) : null;
    const systemOwnerName = systemOwnerMember
      ? `${systemOwnerMember.firstName} ${systemOwnerMember.lastName}`
      : "-";

    // Group rows by category
    const rowsByCategory = FUNCTION_TEST_CATEGORIES.reduce((acc, cat) => {
      acc[cat] = rows.filter((r) => r.category === cat);
      return acc;
    }, {} as Record<FunctionTestCategory, FunctionTestRow[]>);

    const sortedRows = FUNCTION_TEST_CATEGORIES.flatMap((cat) => rowsByCategory[cat]);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Funksjonstest - ${functionTest.systemCode}</title>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 10px;
            line-height: 1.4;
            margin: 0;
            padding: 20px;
          }
          h1 { font-size: 18px; margin: 0 0 10px 0; }
          h2 { font-size: 14px; margin: 15px 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .header-info { }
          .header-info p { margin: 2px 0; }
          .meta-table { border-collapse: collapse; margin-bottom: 15px; }
          .meta-table td { padding: 4px 12px 4px 0; }
          .meta-table .label { font-weight: 600; color: #666; }
          table.data {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            page-break-inside: auto;
          }
          table.data th, table.data td {
            border: 1px solid #ccc;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
          }
          table.data th {
            background: #f5f5f5;
            font-weight: 600;
            white-space: nowrap;
          }
          table.data tr { page-break-inside: avoid; }
          .status-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 600;
          }
          .status-completed { background: #dcfce7; color: #166534; }
          .status-not-started { background: #f1f5f9; color: #475569; }
          .status-not-applicable { background: #fef3c7; color: #92400e; }
          .status-deviation { background: #fee2e2; color: #dc2626; }
          .category-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 9px;
            background: #e5e7eb;
            color: #374151;
          }
          .comments {
            font-size: 9px;
            color: #666;
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #ddd;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ccc;
            font-size: 9px;
            color: #666;
          }
          .signature-area {
            display: flex;
            gap: 40px;
            margin-top: 30px;
          }
          .signature-box {
            flex: 1;
            border-top: 1px solid #333;
            padding-top: 8px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-info">
            <h1>Funksjonstest: ${functionTest.systemCode}</h1>
            <p><strong>${project.name}</strong></p>
          </div>
        </div>

        <table class="meta-table">
          <tr>
            <td class="label">Systemeier:</td>
            <td>${systemOwnerName}</td>
            <td class="label">Planlagt dato:</td>
            <td>${testDate}</td>
          </tr>
          <tr>
            <td class="label">Fremdrift:</td>
            <td>${stats.progress.toFixed(0)}% fullført</td>
            <td class="label">Antall tester:</td>
            <td>${rows.length}</td>
          </tr>
        </table>

        ${responsibles.length > 0 ? `
        <h2>Delansvarlige</h2>
        <table class="data">
          <thead>
            <tr>
              <th>System</th>
              <th>Disiplin</th>
              <th>Ansvarlig</th>
            </tr>
          </thead>
          <tbody>
            ${responsibles.map((r) => `
              <tr>
                <td>${r.systemCode}</td>
                <td>${r.discipline}</td>
                <td>${r.user ? `${r.user.firstName} ${r.user.lastName}` : "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ` : ""}

        <h2>Testpunkter</h2>
        <table class="data">
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th style="width: 80px;">Kategori</th>
              <th style="width: 100px;">Systemdel</th>
              <th style="width: 100px;">Funksjon</th>
              <th style="min-width: 180px;">Testutførelse</th>
              <th style="min-width: 150px;">Akseptkriterie</th>
              <th style="width: 80px;">Status</th>
              <th style="width: 70px;">Dato</th>
            </tr>
          </thead>
          <tbody>
            ${sortedRows.map((row, idx) => {
      const comments = Array.isArray(row.comments) ? row.comments : [];
      const statusClass =
        row.status === "COMPLETED" ? "status-completed" :
          row.status === "NOT_APPLICABLE" ? "status-not-applicable" :
            row.status === "DEVIATION" ? "status-deviation" :
              "status-not-started";
      const statusText = statusLabel(row.status);
      const dateStr = row.completedDate
        ? format(new Date(row.completedDate), "dd.MM.yy")
        : "-";
      const hasComments = comments.length > 0;

      return `
              <tr>
                <td>${idx + 1}</td>
                <td><span class="category-badge">${formatCategory(row.category)}</span></td>
                <td>${row.systemPart}</td>
                <td>${row.function}</td>
                <td>${(row.testExecution || "").replace(/\r?\n/g, "<br>")}${hasComments ? `<div class="comments"><strong>Kommentarer:</strong> ${comments.map((c: { content: string }) => c.content).join("; ")}</div>` : ""}</td>
                <td>${(row.acceptanceCriteria || "").replace(/\r?\n/g, "<br>")}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${dateStr}</td>
              </tr>
              `;
    }).join("")}
          </tbody>
        </table>

        <div class="signature-area">
          <div class="signature-box">
            <strong>Systemeier</strong><br>
            Dato: _____________ Signatur: _________________________
          </div>
          <div class="signature-box">
            <strong>Kontrollør</strong><br>
            Dato: _____________ Signatur: _________________________
          </div>
        </div>

        <div class="footer">
          Eksportert fra SysFlyt ${format(new Date(), "dd.MM.yyyy HH:mm")}
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  async function createPredefinedTest(payload: PredefinedFunctionTestInput) {
    const res = await fetch("/api/function-tests/predefined", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke opprette testmal");
    return data.test as PredefinedFunctionTestTemplate;
  }

  function buildImportKey(input: {
    systemGroup: string;
    systemType: string;
    functionName: string;
    category: FunctionTestCategory;
    testExecution: string;
    acceptanceCriteria: string;
  }) {
    return [
      normalizeCategoryText(input.systemGroup || ""),
      normalizeCategoryText(input.systemType),
      normalizeCategoryText(input.functionName),
      input.category,
      input.testExecution.trim(),
      input.acceptanceCriteria.trim(),
    ].join("|");
  }

  async function handleAdminImportFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) {
        toast.error("Fant ingen ark i filen");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
      if (rows.length === 0) {
        toast.error("Filen er tom");
        return;
      }

      const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
      const normalizedHeader = headerRow.map((cell) =>
        normalizeCategoryText(String(cell ?? ""))
      );
      const findHeaderIndex = (terms: string[]) => {
        const normalizedTerms = terms.map((term) => normalizeCategoryText(term));
        return normalizedHeader.findIndex((cell) =>
          normalizedTerms.some(
            (term) => cell === term || cell.startsWith(term) || cell.includes(term)
          )
        );
      };

      const headerIndexes = {
        systemGroup: findHeaderIndex(["system"]),
        systemType: findHeaderIndex(["type", "systemtype"]),
        functionName: findHeaderIndex(["funksjon"]),
        category: findHeaderIndex(["kategori"]),
        testExecution: findHeaderIndex([
          "testutforelse",
          "testutførelse",
          "testutf",
          "testutfor",
        ]),
        acceptanceCriteria: findHeaderIndex(["akseptkriterier", "akseptkriterie", "aksept"]),
      };

      const headerMatchCount = Object.values(headerIndexes).filter((idx) => idx >= 0).length;
      const hasHeader =
        headerMatchCount >= 3 &&
        normalizedHeader.some((cell) => cell.includes("funksjon") || cell.includes("testutf"));

      const columnMap = hasHeader
        ? headerIndexes
        : {
          systemGroup: 0,
          systemType: 1,
          functionName: 2,
          category: 3,
          testExecution: 4,
          acceptanceCriteria: 5,
        };

      if (
        hasHeader &&
        (columnMap.systemType < 0 ||
          columnMap.functionName < 0 ||
          columnMap.testExecution < 0 ||
          columnMap.acceptanceCriteria < 0)
      ) {
        toast.error(
          "Fant ikke alle kolonner. Forventet System, Type, Funksjon, Kategori, Testutførelse, Akseptkriterier."
        );
        return;
      }

      const startIndex = hasHeader ? 1 : 0;

      const parsed: ImportedFunctionTestRow[] = [];
      for (let i = startIndex; i < rows.length; i += 1) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const systemGroup =
          columnMap.systemGroup >= 0 ? String(row[columnMap.systemGroup] ?? "").trim() : "";
        const systemType =
          columnMap.systemType >= 0 ? String(row[columnMap.systemType] ?? "").trim() : "";
        const functionName =
          columnMap.functionName >= 0 ? String(row[columnMap.functionName] ?? "").trim() : "";
        const categoryLabel =
          columnMap.category >= 0 ? String(row[columnMap.category] ?? "").trim() : "";
        const testExecution =
          columnMap.testExecution >= 0 ? String(row[columnMap.testExecution] ?? "").trim() : "";
        const acceptanceCriteria =
          columnMap.acceptanceCriteria >= 0
            ? String(row[columnMap.acceptanceCriteria] ?? "").trim()
            : "";

        if (
          !systemGroup &&
          !systemType &&
          !functionName &&
          !categoryLabel &&
          !testExecution &&
          !acceptanceCriteria
        ) {
          continue;
        }
        if (!systemType || !functionName || !testExecution || !acceptanceCriteria) continue;

        parsed.push({
          systemGroup,
          systemType,
          functionName,
          category: categoryLabel ? mapCategoryLabel(categoryLabel) : "OTHER",
          testExecution,
          acceptanceCriteria,
        });
      }

      if (parsed.length === 0) {
        toast.error("Fant ingen gyldige rader i importen");
        return;
      }

      setAdminImportRows(parsed);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke lese Excel-fil"));
    } finally {
      if (adminImportInputRef.current) adminImportInputRef.current.value = "";
    }
  }

  async function handleAdminImportSubmit() {
    if (adminImportRows.length === 0) return;

    const existingKeys = new Set(
      adminPredefinedTests.map((test) =>
        buildImportKey({
          systemGroup: test.systemGroup || "",
          systemType: test.systemType || test.systemPart || "",
          functionName: test.function,
          category: test.category,
          testExecution: test.testExecution,
          acceptanceCriteria: test.acceptanceCriteria,
        })
      )
    );
    const seenKeys = new Set<string>();

    const rowsToImport = adminImportRows.filter((row) => {
      const systemGroup = row.systemGroup.trim();
      const systemType = row.systemType.trim();
      const functionName = row.functionName.trim();
      const testExecution = row.testExecution.trim();
      const acceptanceCriteria = row.acceptanceCriteria.trim();

      if (!systemType || !functionName || !testExecution || !acceptanceCriteria) return false;

      const key = buildImportKey({
        systemGroup,
        systemType,
        functionName,
        category: row.category,
        testExecution,
        acceptanceCriteria,
      });
      if (existingKeys.has(key) || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    if (rowsToImport.length === 0) {
      toast.info("Ingen nye rader å importere");
      setAdminImportRows([]);
      return;
    }

    const skippedCount = adminImportRows.length - rowsToImport.length;

    markBusy("admin:import", true);
    try {
      const results = await Promise.allSettled(
        rowsToImport.map((row) =>
          createPredefinedTest({
            category: row.category,
            systemGroup: row.systemGroup.trim(),
            systemType: row.systemType.trim(),
            function: row.functionName.trim(),
            testExecution: row.testExecution.trim(),
            acceptanceCriteria: row.acceptanceCriteria.trim(),
          })
        )
      );

      const created = results
        .filter((r): r is PromiseFulfilledResult<PredefinedFunctionTestTemplate> => r.status === "fulfilled")
        .map((r) => r.value);
      const failed = results.filter((r) => r.status === "rejected");

      if (created.length > 0) {
        setAdminPredefinedTests((prev) => {
          let next = prev.slice();
          for (const entry of created) {
            next = upsertPredefinedTests(next, entry);
          }
          return next;
        });
        setPredefinedTests((prev) => {
          let next = prev.slice();
          for (const entry of created) {
            next = upsertPredefinedTests(next, entry);
          }
          return next;
        });
        setAdminImportRows([]);
      }

      if (skippedCount > 0) {
        toast.info(`Hoppet over ${skippedCount} eksisterende rader`);
      }
      if (failed.length > 0) {
        toast.error(`Kunne ikke importere ${failed.length} rader`);
      }
      if (created.length > 0) {
        toast.success(`Importerte ${created.length} testmaler`);
      }
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke importere testmaler"));
    } finally {
      markBusy("admin:import", false);
    }
  }

  async function adminCreatePredefinedTest() {
    if (
      !adminNewTest.systemType ||
      !adminNewTest.function ||
      !adminNewTest.testExecution ||
      !adminNewTest.acceptanceCriteria
    ) {
      toast.error("Alle felt må fylles ut");
      return;
    }

    markBusy("admin:create", true);
    try {
      const payload: PredefinedFunctionTestInput = {
        category: adminNewTest.category,
        systemGroup: adminNewTest.systemGroup.trim(),
        systemType: adminNewTest.systemType.trim(),
        function: adminNewTest.function.trim(),
        testExecution: adminNewTest.testExecution.trim(),
        acceptanceCriteria: adminNewTest.acceptanceCriteria.trim(),
      };
      const created = await createPredefinedTest(payload);
      setAdminPredefinedTests((prev) => upsertPredefinedTests(prev, created));
      setPredefinedTests((prev) => upsertPredefinedTests(prev, created));
      setAdminNewTest((prev) => ({
        ...prev,
        testExecution: "",
        acceptanceCriteria: "",
      }));
      toast.success("Testmal opprettet");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke opprette testmal"));
    } finally {
      markBusy("admin:create", false);
    }
  }

  async function adminUpdatePredefinedTest() {
    if (!adminEditingTest) return;

    markBusy(`admin:update:${adminEditingTest.id}`, true);
    try {
      const payload: PredefinedFunctionTestInput & { id: string } = {
        id: adminEditingTest.id,
        category: adminEditingTest.category,
        systemGroup: (adminEditingTest.systemGroup || "").trim(),
        systemType: (adminEditingTest.systemType || "").trim(),
        function: adminEditingTest.function.trim(),
        testExecution: adminEditingTest.testExecution.trim(),
        acceptanceCriteria: adminEditingTest.acceptanceCriteria.trim(),
      };
      const res = await fetch("/api/function-tests/predefined", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke oppdatere testmal");

      const updated = data.test as PredefinedFunctionTestTemplate;
      setAdminPredefinedTests((prev) => upsertPredefinedTests(prev, updated));
      setPredefinedTests((prev) => upsertPredefinedTests(prev, updated));
      setAdminEditingTest(null);
      toast.success("Testmal oppdatert");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere testmal"));
    } finally {
      markBusy(`admin:update:${adminEditingTest.id}`, false);
    }
  }

  async function adminDeletePredefinedTest(testId: string) {
    markBusy(`admin:delete:${testId}`, true);
    try {
      const res = await fetch(`/api/function-tests/predefined?id=${encodeURIComponent(testId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke slette testmal");

      setAdminPredefinedTests((prev) => prev.filter((t) => t.id !== testId));
      setPredefinedTests((prev) => prev.filter((t) => t.id !== testId));
      toast.success("Testmal slettet");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke slette testmal"));
    } finally {
      markBusy(`admin:delete:${testId}`, false);
    }
  }

  async function adminDeleteFunctionGroup(group: PredefinedFunctionGroup) {
    const busyKey = `admin:delete_group:${group.systemGroup ?? ""}:${group.systemType ?? ""}:${group.function}`;
    markBusy(busyKey, true);
    try {
      // Find all tests matching this group
      const testsToDelete = adminPredefinedTests.filter((t) => {
        const groupMatch = normalizeTemplateSystemGroup(t) === (group.systemGroup ?? "Generelt");
        const typeMatch = normalizeTemplateSystemType(t) === (group.systemType ?? "Ukjent type");
        const functionMatch = t.function.trim() === group.function.trim();
        return groupMatch && typeMatch && functionMatch;
      });

      if (testsToDelete.length === 0) {
        toast.info("Ingen tester å slette");
        return;
      }

      // Delete all matching tests
      const results = await Promise.allSettled(
        testsToDelete.map((t) =>
          fetch(`/api/function-tests/predefined?id=${encodeURIComponent(t.id)}`, {
            method: "DELETE",
          })
        )
      );

      const deletedIds = testsToDelete
        .filter((_, idx) => results[idx].status === "fulfilled")
        .map((t) => t.id);
      const failedCount = results.filter((r) => r.status === "rejected").length;

      if (deletedIds.length > 0) {
        setAdminPredefinedTests((prev) => prev.filter((t) => !deletedIds.includes(t.id)));
        setPredefinedTests((prev) => prev.filter((t) => !deletedIds.includes(t.id)));
        toast.success(`Slettet ${deletedIds.length} testmaler`);
      }
      if (failedCount > 0) {
        toast.error(`Kunne ikke slette ${failedCount} testmaler`);
      }
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke slette testmaler"));
    } finally {
      markBusy(busyKey, false);
    }
  }

  function openAdminForFunction(
    systemGroup: string,
    systemType: string,
    functionName: string,
    mode: "create" | "edit" = "create"
  ) {
    setAdminModalOpen(true);
    setAdminContextFilter({ systemGroup, systemType, functionName });
    setAdminImportRows([]);
    setAdminNewTest((prev) => ({
      ...prev,
      systemGroup,
      systemType,
      function: functionName,
    }));

    if (mode === "edit") {
      const match = adminPredefinedTests.find((t) => {
        const groupMatch = normalizeTemplateSystemGroup(t) === systemGroup;
        const typeMatch = normalizeTemplateSystemType(t) === systemType;
        const functionMatch =
          t.function.trim().toLowerCase() === functionName.trim().toLowerCase();
        return groupMatch && typeMatch && functionMatch;
      });
      setAdminEditingTest(match ?? null);
    } else {
      setAdminEditingTest(null);
    }
  }

  async function updateFunctionTest(patch: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${project.id}/function-tests/${functionTest.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke oppdatere funksjonstest");
    return data.functionTest;
  }

  async function updateRow(rowId: string, patch: Record<string, unknown>) {
    const res = await fetch(
      `/api/projects/${project.id}/function-tests/${functionTest.id}/rows/${rowId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke oppdatere testpunkt");
    return data.row as FunctionTestRow;
  }

  async function moveRow(rowId: string, direction: "up" | "down") {
    const currentRow = rows.find((r) => r.id === rowId);
    if (!currentRow) return;

    const sorted = rows
      .filter((r) => r.category === currentRow.category)
      .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id.localeCompare(b.id)));
    const idx = sorted.findIndex((r) => r.id === rowId);
    if (idx === -1) return;
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= sorted.length) return;
    const neighbor = sorted[neighborIdx];

    const res = await fetch(
      `/api/projects/${project.id}/function-tests/${functionTest.id}/rows/reorder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, direction }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke endre rekkefølge");
    if (!data.changed) return;

    setRows((prev) => {
      const map = new Map(prev.map((r) => [r.id, r] as const));
      const current = map.get(rowId);
      const other = map.get(neighbor.id);
      if (!current || !other) return prev;
      const next = prev.map((r) => {
        if (r.id === current.id) return { ...r, sortOrder: other.sortOrder };
        if (r.id === other.id) return { ...r, sortOrder: current.sortOrder };
        return r;
      });
      return next;
    });
  }

  async function handleSystemOwnerChange(next: string) {
    const value = next === "__none__" ? "" : next;
    setSystemOwnerId(value);
    try {
      await updateFunctionTest({ systemOwnerId: value || null });
      toast.success("Systemeier oppdatert");
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere systemeier"));
      setSystemOwnerId(functionTest.systemOwnerId || "");
    }
  }

  async function handleSystemOwnerDisciplineChange(next: string) {
    const value = next === "__none__" ? "" : next;
    setSystemOwnerDiscipline(value);
    try {
      await updateFunctionTest({ systemOwnerDiscipline: value || null });
      toast.success("Systemeier-fag oppdatert");
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere systemeier-fag"));
      setSystemOwnerDiscipline(functionTest.systemOwnerDiscipline || "");
    }
  }

  async function handleSoftwareResponsibleChange(next: string) {
    const value = next === "__none__" ? "" : next;
    setSoftwareResponsible(value);
    try {
      await updateFunctionTest({ softwareResponsible: value || null });
      toast.success("Programvare-ansvarlig oppdatert");
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere programvare-ansvarlig"));
      setSoftwareResponsible(functionTest.softwareResponsible || "");
    }
  }

  async function handleDateChange(nextStart: Date | undefined, nextEnd: Date | undefined, phase: TestPhase = selectedPhase) {
    // Update local state
    setPhaseDates(prev => ({
      ...prev,
      [phase]: { start: nextStart, end: nextEnd }
    }));

    // Build the full dates payload with all phases
    const allPhaseDates = {
      ...phaseDates,
      [phase]: { start: nextStart, end: nextEnd }
    };

    const payload: FunctionTestDates = {
      ioTesting: {
        start: allPhaseDates.ioTesting?.start?.toISOString() || null,
        end: allPhaseDates.ioTesting?.end?.toISOString() || null,
      },
      egentest: {
        start: allPhaseDates.egentest?.start?.toISOString() || null,
        end: allPhaseDates.egentest?.end?.toISOString() || null,
      },
      funksjonstest: {
        start: allPhaseDates.funksjonstest?.start?.toISOString() || null,
        end: allPhaseDates.funksjonstest?.end?.toISOString() || null,
      },
    };

    try {
      await updateFunctionTest({ dates: payload });
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere datoer"));
    }
  }

  async function handleUploadDocument(file: File) {
    markBusy("upload", true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/documents`,
        { method: "POST", body: formData }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke laste opp dokument");

      setDocuments(data.documents || []);
      toast.success("Dokument lastet opp");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke laste opp dokument"));
    } finally {
      markBusy("upload", false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteDocument(documentId: string) {
    markBusy(`doc:${documentId}`, true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/documents?documentId=${encodeURIComponent(
          documentId
        )}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke slette dokument");
      setDocuments(data.documents || []);
      toast.success("Dokument slettet");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke slette dokument"));
    } finally {
      markBusy(`doc:${documentId}`, false);
    }
  }

  async function patchRow(rowId: string, patch: Record<string, unknown>, failure: string) {
    markBusy(`row:${rowId}`, true);
    try {
      const updated = await updateRow(rowId, patch);
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...updated } : r)));
    } catch (e: unknown) {
      toast.error(errorMessage(e, failure));
    } finally {
      markBusy(`row:${rowId}`, false);
    }
  }

  async function handleRowStatusChange(rowId: string, status: FunctionTestRowStatus) {
    // If selecting DEVIATION, show dialog first
    if (status === "DEVIATION") {
      const row = rows.find((r) => r.id === rowId);
      if (row) {
        setDeviationDialogRow(row);
        return;
      }
    }
    await patchRow(rowId, { status }, "Kunne ikke oppdatere status");
  }

  async function confirmDeviation() {
    if (!deviationDialogRow) return;
    markBusy(`row:${deviationDialogRow.id}`, true);
    try {
      const updated = await updateRow(deviationDialogRow.id, { status: "DEVIATION" });
      setRows((prev) => prev.map((r) => (r.id === deviationDialogRow.id ? { ...r, ...updated } : r)));
      setDeviationDialogRow(null);
      // Open row dialog to add comment
      const freshRow = { ...deviationDialogRow, ...updated };
      openRowDialog(freshRow);
      toast.info("Beskriv avviket i kommentarfeltet");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke sette status til Avvik"));
    } finally {
      markBusy(`row:${deviationDialogRow.id}`, false);
    }
  }

  async function handleRowDisciplineChange(rowId: string, discipline: string) {
    await patchRow(
      rowId,
      { discipline: discipline === "__none__" ? null : discipline },
      "Kunne ikke oppdatere delansvarlig"
    );
  }

  async function handleRowTestParticipationChange(rowId: string, testParticipation: string) {
    await patchRow(
      rowId,
      { testParticipation: testParticipation === "__none__" ? null : testParticipation },
      "Kunne ikke oppdatere testdeltagelse"
    );
  }

  async function handleRowAssignedChange(rowId: string, assignedToId: string) {
    await patchRow(
      rowId,
      { assignedToId: assignedToId === "__none__" ? null : assignedToId },
      "Kunne ikke oppdatere tilordnet"
    );
  }

  async function handleRowCategoryChange(rowId: string, category: FunctionTestCategory) {
    await patchRow(rowId, { category }, "Kunne ikke oppdatere kategori");
  }

  async function handleRowPerformedByChange(rowId: string, performedById: string) {
    await patchRow(
      rowId,
      { performedById: performedById === "__none__" ? null : performedById },
      "Kunne ikke oppdatere utførende"
    );
  }

  async function handleRowCompletedDateChange(rowId: string, date: Date | null) {
    await patchRow(
      rowId,
      { completedDate: date ? date.toISOString() : null },
      "Kunne ikke oppdatere dato"
    );
  }

  async function handleRowSystemPartCommit(rowId: string, value: string) {
    await patchRow(rowId, { systemPart: value.trim() }, "Kunne ikke oppdatere systemdel");
  }

  async function handleRowFunctionCommit(rowId: string, value: string) {
    await patchRow(rowId, { function: value.trim() }, "Kunne ikke oppdatere funksjon");
  }

  async function applyTemplateToRow(
    row: FunctionTestRow,
    template: PredefinedFunctionTestTemplate
  ) {
    markBusy(`row:${row.id}`, true);
    try {
      const updated = await updateRow(row.id, {
        category: template.category,
        systemPart: formatTemplateSystemPart(template),
        function: template.function,
        testExecution: template.testExecution,
        acceptanceCriteria: template.acceptanceCriteria,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      setTemplatePickerRow(null);
      toast.success("Testmal brukt på raden");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere testpunkt"));
    } finally {
      markBusy(`row:${row.id}`, false);
    }
  }

  async function createRowsFromFunctionGroup(group: PredefinedFunctionGroup) {
    if (!group.systemType) {
      toast.error("Mangler type for funksjonen");
      return;
    }
    const busyKey = `row:add_group:${group.systemGroup ?? ""}:${group.systemType ?? ""}:${group.function}`;
    markBusy(busyKey, true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predefinedFunctionGroup: {
              systemGroup: group.systemGroup ?? "",
              systemType: group.systemType ?? "",
              functionName: group.function,
            },
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke legge til testpunkter");
      const createdRows = Array.isArray(data.rows) ? (data.rows as FunctionTestRow[]) : [];
      if (createdRows.length > 0) {
        setRows((prev) => [...prev, ...createdRows]);
      }
      const createdCount = Number.isFinite(Number(data.createdCount))
        ? Number(data.createdCount)
        : createdRows.length;
      const skippedCount = Number.isFinite(Number(data.skippedCount))
        ? Number(data.skippedCount)
        : 0;

      if (createdCount === 0) {
        toast.info("Ingen nye testpunkter å legge til");
      } else {
        toast.success(`La til ${createdCount} testpunkter`);
        setAddRowOpen(false);
      }
      if (skippedCount > 0) {
        toast.info(`Hoppet over ${skippedCount} eksisterende testpunkter`);
      }
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke legge til testpunkter"));
    } finally {
      markBusy(busyKey, false);
    }
  }

  async function createCustomRow() {
    markBusy("row:add_custom", true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "OTHER",
            systemPart: "",
            function: "",
            testExecution: "",
            acceptanceCriteria: "",
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke opprette testpunkt");
      const created = data.row as FunctionTestRow;
      setRows((prev) => [...prev, created]);
      toast.success("Egendefinert rad lagt til");
      openRowDialog(created);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke legge til egendefinert rad"));
    } finally {
      markBusy("row:add_custom", false);
    }
  }

  function openRowDialog(row: FunctionTestRow) {
    setSelectedRow(row);
    setEditExecution(row.testExecution || "");
    setEditAcceptance(row.acceptanceCriteria || "");
    setCommentDraft("");
  }

  async function copyRow(row: FunctionTestRow) {
    markBusy(`row:copy:${row.id}`, true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: row.category,
            systemPart: row.systemPart,
            function: row.function,
            testExecution: row.testExecution,
            acceptanceCriteria: row.acceptanceCriteria,
            responsibleId: row.responsibleId,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke kopiere rad");
      const created = data.row as FunctionTestRow;
      setRows((prev) => [...prev, created]);
      toast.success("Rad kopiert");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke kopiere rad"));
    } finally {
      markBusy(`row:copy:${row.id}`, false);
    }
  }

  async function deleteRow(row: FunctionTestRow) {
    markBusy(`row:delete:${row.id}`, true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/rows/${row.id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke slette rad");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setDeleteConfirmRow(null);
      toast.success("Rad slettet");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke slette rad"));
    } finally {
      markBusy(`row:delete:${row.id}`, false);
    }
  }

  async function saveRowDetails() {
    if (!selectedRow) return;
    markBusy(`rowdetails:${selectedRow.id}`, true);
    try {
      const updated = await updateRow(selectedRow.id, {
        testExecution: editExecution,
        acceptanceCriteria: editAcceptance,
      });
      setRows((prev) => prev.map((r) => (r.id === selectedRow.id ? { ...r, ...updated } : r)));
      toast.success("Testpunkt oppdatert");
      setSelectedRow((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke oppdatere testpunkt"));
    } finally {
      markBusy(`rowdetails:${selectedRow.id}`, false);
    }
  }

  async function addCommentToSelectedRow() {
    if (!selectedRow) return;
    const content = commentDraft.trim();
    if (!content) return;

    const existing = normalizeComments(selectedRow.comments);
    const next = [
      {
        id: crypto.randomUUID(),
        authorId: userId,
        createdAt: new Date().toISOString(),
        content,
      } satisfies RowComment,
      ...existing,
    ];

    markBusy(`rowcomment:${selectedRow.id}`, true);
    try {
      const updated = await updateRow(selectedRow.id, { comments: next });
      setRows((prev) => prev.map((r) => (r.id === selectedRow.id ? { ...r, ...updated } : r)));
      setSelectedRow((prev) => (prev ? { ...prev, ...updated } : prev));
      setCommentDraft("");
      toast.success("Kommentar lagt til");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke legge til kommentar"));
    } finally {
      markBusy(`rowcomment:${selectedRow.id}`, false);
    }
  }

  function removeResponsibleFromDraft(responsibleId: string) {
    setResponsiblesDraft((prev) => prev.filter((r) => r.id !== responsibleId));
  }

  function updateResponsibleDraft(responsibleId: string, patch: Partial<FunctionTestResponsible>) {
    setResponsiblesDraft((prev) =>
      prev.map((r) => (r.id === responsibleId ? { ...r, ...patch } : r))
    );
  }

  function addResponsibleToDraft() {
    const systemCode = normalizeSystemCode(newResponsibleSystemCode);
    const discipline = newResponsibleDiscipline.trim();

    if (!systemCode || !discipline) {
      toast.error("Systemkode og fag er påkrevd");
      return;
    }

    const exists = responsiblesDraft.some(
      (r) => normalizeSystemCode(r.systemCode) === systemCode
    );
    if (exists) {
      toast.error("Systemet finnes allerede i listen");
      return;
    }

    setResponsiblesDraft((prev) =>
      [
        ...prev,
        {
          id: `temp_${crypto.randomUUID()}`,
          systemCode,
          discipline,
          systemOwnerDiscipline: null,
          testParticipation: null,
          prerequisites: null,
          userId: null,
          user: null,
          isAutoDetected: false,
        },
      ].sort((a, b) => a.systemCode.localeCompare(b.systemCode))
    );
    setNewResponsibleSystemCode("");
    setNewResponsibleDiscipline("");
  }

  async function saveResponsiblesDraft() {
    const cleaned = responsiblesDraft
      .map((r) => ({
        ...r,
        systemCode: normalizeSystemCode(r.systemCode),
        discipline: r.discipline.trim(),
      }))
      .filter((r) => r.systemCode || r.discipline);

    for (const r of cleaned) {
      if (!r.systemCode || !r.discipline) {
        toast.error("Alle delansvarlige må ha systemkode og fag");
        return;
      }
    }

    const seen = new Set<string>();
    for (const r of cleaned) {
      const key = r.systemCode;
      if (seen.has(key)) {
        toast.error(`Dobbeltføring: ${r.systemCode}`);
        return;
      }
      seen.add(key);
    }

    const originalById = new Map(responsiblesDraftOriginal.map((r) => [r.id, r] as const));
    const draftById = new Map(cleaned.map((r) => [r.id, r] as const));

    const deletions = responsiblesDraftOriginal.filter((r) => !draftById.has(r.id));
    const creations = cleaned.filter((r) => !originalById.has(r.id));
    const updates = cleaned.filter((r) => {
      const original = originalById.get(r.id);
      if (!original) return false;
      return (
        normalizeSystemCode(original.systemCode) !== r.systemCode ||
        original.discipline.trim() !== r.discipline ||
        (original.systemOwnerDiscipline || null) !== (r.systemOwnerDiscipline || null) ||
        (original.testParticipation || null) !== (r.testParticipation || null) ||
        (original.userId || null) !== (r.userId || null)
      );
    });

    if (deletions.length === 0 && creations.length === 0 && updates.length === 0) {
      setResponsiblesOpen(false);
      toast.success("Ingen endringer");
      return;
    }

    markBusy("responsibles:save", true);
    try {
      for (const r of deletions) {
        const res = await fetch(
          `/api/projects/${project.id}/function-tests/${functionTest.id}/responsibles/${r.id}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke slette delansvarlig");
      }

      for (const r of updates) {
        const res = await fetch(
          `/api/projects/${project.id}/function-tests/${functionTest.id}/responsibles/${r.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemCode: r.systemCode,
              discipline: r.discipline,
              systemOwnerDiscipline: r.systemOwnerDiscipline,
              testParticipation: r.testParticipation,
              userId: r.userId,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke oppdatere delansvarlig");
      }

      for (const r of creations) {
        const res = await fetch(
          `/api/projects/${project.id}/function-tests/${functionTest.id}/responsibles`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemCode: r.systemCode,
              discipline: r.discipline,
              systemOwnerDiscipline: r.systemOwnerDiscipline,
              testParticipation: r.testParticipation,
              userId: r.userId,
              isAutoDetected: r.isAutoDetected,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke opprette delansvarlig");
      }

      const refreshRes = await fetch(
        `/api/projects/${project.id}/function-tests/${functionTest.id}/responsibles`
      );
      const refreshData = await refreshRes.json().catch(() => ({}));
      if (!refreshRes.ok) {
        throw new Error(refreshData.error || "Kunne ikke hente delansvarlige");
      }

      const nextResponsibles = Array.isArray(refreshData.responsibles)
        ? refreshData.responsibles
        : [];
      setResponsibles(nextResponsibles);

      const deletedIds = new Set(deletions.map((r) => r.id));
      if (deletedIds.size > 0) {
        setRows((prev) =>
          prev.map((row) =>
            row.responsibleId && deletedIds.has(row.responsibleId)
              ? { ...row, responsibleId: null }
              : row
          )
        );
      }

      toast.success("Delansvarlige oppdatert");
      setResponsiblesOpen(false);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kunne ikke lagre delansvarlige"));
    } finally {
      markBusy("responsibles:save", false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/projects/${project.id}/protocols/function-tests`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Tilbake til oversikt
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Funksjonstest:{" "}
              <span className="font-mono">{functionTest.systemCode}</span>
              {functionTest.systemName ? ` – ${functionTest.systemName}` : ""}
            </h1>
            <p className="text-muted-foreground">
              Hold status, delansvarlige og dokumentasjon samlet per system.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats.deviationRows > 0 && (
              <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/25 border-red-200">
                {stats.deviationRows} avvik
              </Badge>
            )}
            <Badge variant="outline" className="font-mono">
              {stats.progress}%
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportClick}
              disabled={rows.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Eksporter PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmailModal(true)}
              className="gap-2"
            >
              <Mail className="h-4 w-4" />
              Send til e-post
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Datoer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Testfase</div>
                  <Select
                    value={selectedPhase}
                    onValueChange={(v) => setSelectedPhase(v as TestPhase)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_PHASES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Start</div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? (
                          format(startDate, "dd.MM.yyyy", { locale: nb })
                        ) : (
                          <span>Velg dato</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(d) => handleDateChange(d, endDate || d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Slutt</div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? (
                          format(endDate, "dd.MM.yyyy", { locale: nb })
                        ) : (
                          <span>Velg dato</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(d) => handleDateChange(startDate, d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Systemeier (fag)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select
                  value={systemOwnerDiscipline || "__none__"}
                  onValueChange={(v) => handleSystemOwnerDisciplineChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Velg fag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ingen valgt</SelectItem>
                    {DISCIPLINES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  Ansvarlig fag for systemet.
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Programvare-Ansvarlig
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select
                  value={softwareResponsible || "__none__"}
                  onValueChange={(v) => handleSoftwareResponsibleChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Velg fag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ingen valgt</SelectItem>
                    {DISCIPLINES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  Ansvarlig for programvare.
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Delansvarlige
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium">{responsibles.length}</span>{" "}
                    <span className="text-muted-foreground">oppføringer</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResponsiblesOpen(true)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Administrer
                  </Button>
                </div>
                {responsibles.length > 0 ? (
                  <div className="space-y-2">
                    {responsibles.slice(0, 2).map((r) => (
                      <div key={r.id} className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{r.systemCode}</span>{" "}
                        – {r.discipline}
                      </div>
                    ))}
                    {responsibles.length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{responsibles.length - 2} flere
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Ingen delansvarlige registrert.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Fullført</span>
              <span className="font-medium">{stats.progress}%</span>
            </div>
            <Progress value={stats.progress} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {stats.completedRows} / {stats.totalRows} testpunkter{" "}
              {stats.deviationRows > 0 ? `• ${stats.deviationRows} avvik` : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-muted-foreground" />
              Testpunkter
            </CardTitle>
            <div className="flex items-center gap-3">
              {rows.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => setSendModalOpen(true)}
                  className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Send className="h-4 w-4" />
                  Send til
                </Button>
              )}
              <Badge variant="outline" className="font-mono">
                {filteredRows.length}
              </Badge>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-[auto,1fr] sm:items-center sm:gap-3">
              <span className="text-sm text-muted-foreground">Filter:</span>
              <div className="flex flex-wrap items-center gap-2">
                {FUNCTION_TEST_CATEGORIES.map((category) => {
                  const checked = rowCategoryFilters[category];
                  return (
                    <Button
                      key={category}
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={checked}
                      className={cn(
                        "h-8 gap-2 px-2.5",
                        checked ? "bg-muted/60" : "text-muted-foreground"
                      )}
                      onClick={() =>
                        setRowCategoryFilters((prev) => ({ ...prev, [category]: !prev[category] }))
                      }
                    >
                      <span className="font-mono text-xs leading-none">
                        {checked ? "☑" : "☐"}
                      </span>
                      {formatCategory(category)}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[auto,1fr] sm:items-center sm:gap-3">
              <span className="hidden w-14 sm:block" aria-hidden />
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Delansvarlig:
                  </span>
                  <Select
                    value={rowResponsibleFilter}
                    onValueChange={(value) =>
                      setRowResponsibleFilter(value as RowResponsibleFilterValue)
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Alle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Alle</SelectItem>
                      <SelectItem value="UNASSIGNED">Uten delansvarlig</SelectItem>
                      {responsibles
                        .slice()
                        .sort((a, b) => a.systemCode.localeCompare(b.systemCode))
                        .map((r) => (
                          <SelectItem key={r.id} value={`ID:${r.id}`}>
                            {r.systemCode} — {r.discipline}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
                  <Select
                    value={rowStatusFilter}
                    onValueChange={(value) => {
                      if (isRowStatusFilterValue(value)) setRowStatusFilter(value);
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Alle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Alle</SelectItem>
                      <SelectItem value="NOT_STARTED">Ikke startet</SelectItem>
                      <SelectItem value="COMPLETED">Fullført</SelectItem>
                      <SelectItem value="NOT_APPLICABLE">I/A</SelectItem>
                      <SelectItem value="DEVIATION">Avvik</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" title="Sortering">
                    <span className="sr-only">Sort</span>
                  </TableHead>
                  <TableHead className="w-[160px]">Status</TableHead>
                  <TableHead className="w-[320px]" title="Delansvarlig">
                    Delansvarlig
                  </TableHead>
                  <TableHead className="w-[160px]">Kategori</TableHead>
                  <TableHead className="w-[220px]">
                    <span className="flex items-center gap-1">
                      Systemdel
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => setAdminModalOpen(true)}
                        title="Velg fra predefinerte tester"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </TableHead>
                  <TableHead className="w-[260px]">Funksjon</TableHead>
                  <TableHead className="min-w-[320px]" title="Testutførelse">
                    Testutfør.
                  </TableHead>
                  <TableHead className="min-w-[320px]" title="Akseptkriterie">
                    Akseptkrit.
                  </TableHead>
                  <TableHead className="w-[220px]" title="Ansvarlig">
                    Ansvarl.
                  </TableHead>
                  <TableHead className="w-[220px]">Utførende</TableHead>
                  <TableHead className="w-[180px]">Dato</TableHead>
                  <TableHead className="w-[120px]">Behandle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const comments = normalizeComments(row.comments);
                  const completionEnabled = ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(
                    row.status
                  );
                  return (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="align-top">
                        <div className="flex flex-col items-center gap-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveRow(row.id, "up")}
                            disabled={busy[`row:${row.id}`]}
                            title="Flytt opp"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveRow(row.id, "down")}
                            disabled={busy[`row:${row.id}`]}
                            title="Flytt ned"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <Select
                          value={row.status}
                          onValueChange={(value) => {
                            if (isFunctionTestRowStatus(value)) {
                              handleRowStatusChange(row.id, value);
                            }
                          }}
                          disabled={busy[`row:${row.id}`]}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-9 border-transparent hover:border-input focus:ring-0 focus:ring-offset-0 [&>svg]:hidden",
                              statusBadgeClass(row.status)
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NOT_STARTED">○ Ikke</SelectItem>
                            <SelectItem value="COMPLETED">✓ Full</SelectItem>
                            <SelectItem value="NOT_APPLICABLE">⊘ I/A</SelectItem>
                            <SelectItem value="DEVIATION">⚠ Avv.</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="align-top">
                        <Select
                          value={row.discipline || "__none__"}
                          onValueChange={(v) => handleRowDisciplineChange(row.id, v)}
                          disabled={busy[`row:${row.id}`]}
                        >
                          <SelectTrigger className="h-9 border-transparent hover:border-input focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                            <span
                              className={cn(
                                "text-sm",
                                !row.discipline && "text-muted-foreground"
                              )}
                            >
                              {row.discipline || "-"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-</SelectItem>
                            {DISCIPLINES.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="align-top">
                        <Select
                          value={row.category}
                          onValueChange={(value) => {
                            if (isFunctionTestCategory(value)) {
                              handleRowCategoryChange(row.id, value);
                            }
                          }}
                          disabled={busy[`row:${row.id}`]}
                        >
                          <SelectTrigger className="h-9 border-transparent hover:border-input focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="START_STOP">Start/Stopp</SelectItem>
                            <SelectItem value="SECURITY">Sikkerhet</SelectItem>
                            <SelectItem value="REGULATION">Regulering</SelectItem>
                            <SelectItem value="EXTERNAL">Ekstern</SelectItem>
                            <SelectItem value="OTHER">Øvrig</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex items-center gap-1">
                          <Input
                            value={row.systemPart}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, systemPart: e.target.value } : r
                                )
                              )
                            }
                            onBlur={(e) => handleRowSystemPartCommit(row.id, e.target.value)}
                            disabled={busy[`row:${row.id}`]}
                            className="h-9"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setTemplatePickerRow(row)}
                            disabled={busy[`row:${row.id}`]}
                            title="Velg funksjonstest"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <Input
                          value={row.function}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, function: e.target.value } : r
                              )
                            )
                          }
                          onBlur={(e) => handleRowFunctionCommit(row.id, e.target.value)}
                          disabled={busy[`row:${row.id}`]}
                        />
                      </TableCell>

                      <TableCell className="align-top">
                        <div
                          className="text-left text-sm text-muted-foreground whitespace-pre-line cursor-pointer hover:text-foreground"
                          onClick={() => openRowDialog(row)}
                          title="Åpne detaljer"
                        >
                          {row.testExecution || "—"}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <div
                          className="text-left text-sm text-muted-foreground whitespace-pre-line cursor-pointer hover:text-foreground"
                          onClick={() => openRowDialog(row)}
                          title="Åpne detaljer"
                        >
                          {row.acceptanceCriteria || "—"}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <Select
                          value={row.assignedToId || "__none__"}
                          onValueChange={(v) => handleRowAssignedChange(row.id, v)}
                          disabled={busy[`row:${row.id}`]}
                        >
                          <SelectTrigger className="h-9 border-transparent hover:border-input focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-</SelectItem>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {formatUser(m)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="align-top">
                        <Select
                          value={row.performedById || "__none__"}
                          onValueChange={(v) => handleRowPerformedByChange(row.id, v)}
                          disabled={busy[`row:${row.id}`]}
                        >
                          <SelectTrigger className="h-9 border-transparent hover:border-input focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-</SelectItem>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {formatUser(m)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="align-top">
                        {!completionEnabled ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  "h-9 w-full rounded-md px-2 text-left text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                  busy[`row:${row.id}`] && "opacity-60 pointer-events-none"
                                )}
                                disabled={busy[`row:${row.id}`]}
                              >
                                {row.completedDate
                                  ? format(new Date(row.completedDate), "dd.MM.yy", {
                                    locale: nb,
                                  })
                                  : "-"}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={row.completedDate ? new Date(row.completedDate) : undefined}
                                onSelect={(date) => {
                                  if (!date) return;
                                  handleRowCompletedDateChange(row.id, date);
                                }}
                                initialFocus
                              />
                              <div className="flex justify-end gap-2 border-t border-border p-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRowCompletedDateChange(row.id, null)}
                                  disabled={busy[`row:${row.id}`]}
                                >
                                  Nullstill
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex justify-end">
                          <Popover
                            open={rowActionsOpenId === row.id}
                            onOpenChange={(open) => setRowActionsOpenId(open ? row.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 relative"
                                title="Behandle"
                              >
                                <MoreVertical className="h-4 w-4" />
                                {comments.length > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                    {comments.length}
                                  </span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-48 p-1">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
                                onClick={() => {
                                  setRowActionsOpenId(null);
                                  openRowDialog(row);
                                }}
                              >
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                Detaljer
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
                                onClick={() => {
                                  setRowActionsOpenId(null);
                                  openRowDialog(row);
                                }}
                              >
                                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                Kommentarer
                                {comments.length > 0 && (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {comments.length}
                                  </span>
                                )}
                              </button>
                              {completionEnabled && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
                                  onClick={() => {
                                    setRowActionsOpenId(null);
                                    handleRowCompletedDateChange(row.id, null);
                                  }}
                                >
                                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                  Nullstill dato
                                </button>
                              )}
                              <div className="my-1 h-px bg-border" />
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
                                onClick={() => {
                                  setRowActionsOpenId(null);
                                  copyRow(row);
                                }}
                                disabled={busy[`row:copy:${row.id}`]}
                              >
                                <Copy className="h-4 w-4 text-muted-foreground" />
                                Kopier
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setRowActionsOpenId(null);
                                  setDeleteConfirmRow(row);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Slett
                              </button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setAddRowOpen(true)} disabled={busy["row:add_custom"]}>
              + Legg til rad
            </Button>
            <Button variant="outline" onClick={createCustomRow} disabled={busy["row:add_custom"]}>
              + Egendefinert rad
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Legg til funksjon</DialogTitle>
            <DialogDescription>
              Velg en funksjon for å legge inn alle tilhørende testpunkter i funksjonstesten.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-[60dvh] overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">System</TableHead>
                    <TableHead className="w-[160px]">Type</TableHead>
                    <TableHead>Funksjon</TableHead>
                    <TableHead className="w-[110px]">Punkter</TableHead>
                    <TableHead className="w-[110px] text-right">Handling</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/40">
                    <TableHead>
                      <Input
                        value={predefinedListFilters.systemGroup}
                        onChange={(e) => updatePredefinedListFilter("systemGroup", e.target.value)}
                        placeholder="Filter"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead>
                      <Input
                        value={predefinedListFilters.systemType}
                        onChange={(e) => updatePredefinedListFilter("systemType", e.target.value)}
                        placeholder="Filter"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead>
                      <Input
                        value={predefinedListFilters.functionName}
                        onChange={(e) => updatePredefinedListFilter("functionName", e.target.value)}
                        placeholder="Filter"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead />
                    <TableHead className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetPredefinedListFilters}
                      >
                        Nullstill
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {predefinedListLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-sm text-muted-foreground">
                        Henter funksjoner...
                      </TableCell>
                    </TableRow>
                  ) : predefinedList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-sm text-muted-foreground">
                        Ingen funksjoner matcher filteret.
                      </TableCell>
                    </TableRow>
                  ) : (
                    predefinedList.map((t) => {
                      const busyKey = `row:add_group:${t.systemGroup ?? ""}:${t.systemType ?? ""}:${t.function}`;
                      return (
                        <TableRow key={busyKey}>
                          <TableCell className="text-sm">
                            {normalizeGroupSystemGroup(t)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {normalizeGroupSystemType(t)}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{t.function}</div>
                          </TableCell>
                          <TableCell className="text-sm">{t.testCount}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              onClick={() => createRowsFromFunctionGroup(t)}
                              disabled={busy[busyKey]}
                            >
                              + Legg til
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Viser {predefinedListStart}-{predefinedListEnd} av {predefinedListTotal}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPredefinedListPage((prev) => Math.max(1, prev - 1))}
                  disabled={predefinedListPage === 1 || predefinedListLoading}
                >
                  Forrige
                </Button>
                <span>
                  Side {predefinedListPage} av {predefinedListTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPredefinedListPage((prev) =>
                      Math.min(predefinedListTotalPages, prev + 1)
                    )
                  }
                  disabled={predefinedListPage >= predefinedListTotalPages || predefinedListLoading}
                >
                  Neste
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRowOpen(false)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!templatePickerRow}
        onOpenChange={(open) => {
          if (!open) setTemplatePickerRow(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Velg funksjonstest</DialogTitle>
            <DialogDescription>
              Velg system, type og funksjon for{" "}
              {templatePickerRow ? `${templatePickerRow.systemPart || "rad"} - ${templatePickerRow.function}` : "rad"}.
            </DialogDescription>
          </DialogHeader>

          {predefinedTestsLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Henter testmaler...</div>
          ) : templateSystemOptions.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Ingen testmaler er tilgjengelige ennå.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">System</label>
                  <Select
                    value={templatePickerSystem}
                    onValueChange={setTemplatePickerSystem}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Velg system" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateSystemOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Type</label>
                  <Select
                    value={templatePickerType}
                    onValueChange={setTemplatePickerType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Velg type" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateTypeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Funksjon</label>
                  <Input
                    placeholder="Søk funksjon..."
                    value={templatePickerSearch}
                    onChange={(e) => setTemplatePickerSearch(e.target.value)}
                  />
                  <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                    {templateFunctionOptions.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        Ingen funksjoner matcher valget.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {templateFunctionOptions.map((fn) => {
                          const isActive = fn === templatePickerFunction;
                          return (
                            <div
                              key={fn}
                              className={cn(
                                "flex items-center justify-between gap-2 px-3 py-2",
                                isActive ? "bg-muted" : "hover:bg-muted/50"
                              )}
                            >
                              <button
                                type="button"
                                className="flex-1 text-left text-sm font-medium"
                                onClick={() => setTemplatePickerFunction(fn)}
                              >
                                {fn}
                              </button>
                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAdminForFunction(
                                        templatePickerSystem,
                                        templatePickerType,
                                        fn,
                                        "create"
                                      );
                                    }}
                                    title="Legg til testprosedyre"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAdminForFunction(
                                        templatePickerSystem,
                                        templatePickerType,
                                        fn,
                                        "edit"
                                      );
                                    }}
                                    title="Rediger testprosedyre"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Testmaler</label>
                  <div className="rounded-lg border border-border">
                    {templateEntriesForFunction.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        Velg en funksjon for å se testmaler.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {templateEntriesForFunction.map((template) => (
                          <div key={template.id} className="space-y-2 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <Badge variant="outline" className="text-xs">
                                {formatCategory(template.category)}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (templatePickerRow) {
                                    applyTemplateToRow(templatePickerRow, template);
                                  }
                                }}
                                disabled={templatePickerRow ? busy[`row:${templatePickerRow.id}`] : false}
                              >
                                Bruk
                              </Button>
                            </div>
                            <div className="text-sm text-muted-foreground whitespace-pre-line">
                              {template.testExecution}
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-pre-line">
                              {template.acceptanceCriteria}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePickerRow(null)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={responsiblesOpen} onOpenChange={setResponsiblesOpen}>
        <DialogContent style={{ maxWidth: "72rem", width: "90vw" }} className="max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Delansvarlige for <span className="font-mono">{functionTest.systemCode}</span>
            </DialogTitle>
            <DialogDescription>
              Automatisk forslag hentes fra systemskjema. Du kan justere fag og systemeier, eller legge til flere manuelt.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Automatisk hentet fra systemskjema</div>
                  <div className="text-xs text-muted-foreground">
                    {autoDetectState.loading
                      ? "Henter forslag..."
                      : autoDetectState.error
                        ? autoDetectState.error
                        : autoDetectState.schemaTitle
                          ? `Kilde: ${autoDetectState.schemaTitle}`
                          : autoDetectState.message || "Ingen info"}
                  </div>
                </div>
                <Badge
                  variant={autoDetectState.error ? "destructive" : "secondary"}
                  className="shrink-0"
                >
                  {autoDetectState.loading ? "Henter" : autoDetectState.error ? "Feil" : "OK"}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Automatisk hentet</div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">System</TableHead>
                      <TableHead className="w-[160px]">Fag</TableHead>
                      <TableHead className="w-[160px]">Systemeier</TableHead>
                      <TableHead className="w-[140px]">Testdeltagelse</TableHead>
                      <TableHead className="w-[60px]" title="Forutsetninger">
                        <StickyNote className="h-4 w-4 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responsiblesDraft.filter((r) => r.isAutoDetected).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Ingen auto-hentede delansvarlige.
                        </TableCell>
                      </TableRow>
                    ) : (
                      responsiblesDraft
                        .filter((r) => r.isAutoDetected)
                        .sort((a, b) => a.systemCode.localeCompare(b.systemCode))
                        .map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-sm">{r.systemCode}</TableCell>
                            <TableCell>
                              <Select
                                value={r.discipline || "__none__"}
                                onValueChange={(v) =>
                                  updateResponsibleDraft(r.id, { discipline: v === "__none__" ? "" : v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Velg fag..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-</SelectItem>
                                  {DISCIPLINES.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={r.systemOwnerDiscipline || "__none__"}
                                onValueChange={(v) =>
                                  updateResponsibleDraft(r.id, { systemOwnerDiscipline: v === "__none__" ? null : v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Velg fag..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-</SelectItem>
                                  {DISCIPLINES.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={r.testParticipation || "__none__"}
                                onValueChange={(v) =>
                                  updateResponsibleDraft(r.id, { testParticipation: v === "__none__" ? null : v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Velg..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-</SelectItem>
                                  {TEST_PARTICIPATION_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8",
                                      r.prerequisites ? "text-primary" : "text-muted-foreground"
                                    )}
                                    title="Forutsetninger"
                                  >
                                    <StickyNote className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-80">
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">Forutsetninger</div>
                                    <Textarea
                                      placeholder="Beskriv hvilke forutsetninger som kreves fra dette faget..."
                                      value={r.prerequisites || ""}
                                      onChange={(e) =>
                                        updateResponsibleDraft(r.id, { prerequisites: e.target.value || null })
                                      }
                                      className="min-h-[100px]"
                                    />
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                  onClick={() => removeResponsibleFromDraft(r.id)}
                                  title="Fjern"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Manuelt lagt til</div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">System</TableHead>
                      <TableHead className="w-[160px]">Fag</TableHead>
                      <TableHead className="w-[160px]">Systemeier</TableHead>
                      <TableHead className="w-[140px]">Testdeltagelse</TableHead>
                      <TableHead className="w-[60px]" title="Forutsetninger">
                        <StickyNote className="h-4 w-4 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responsiblesDraft.filter((r) => !r.isAutoDetected).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Ingen manuelle delansvarlige.
                        </TableCell>
                      </TableRow>
                    ) : (
                      responsiblesDraft
                        .filter((r) => !r.isAutoDetected)
                        .sort((a, b) => a.systemCode.localeCompare(b.systemCode))
                        .map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Input
                                value={r.systemCode}
                                className="h-9"
                                onChange={(e) =>
                                  updateResponsibleDraft(r.id, { systemCode: e.target.value })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={r.discipline || "__none__"}
                                onValueChange={(v) =>
                                  updateResponsibleDraft(r.id, { discipline: v === "__none__" ? "" : v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Velg fag..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-</SelectItem>
                                  {DISCIPLINES.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={r.systemOwnerDiscipline || "__none__"}
                                onValueChange={(v) =>
                                  updateResponsibleDraft(r.id, { systemOwnerDiscipline: v === "__none__" ? null : v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Velg fag..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-</SelectItem>
                                  {DISCIPLINES.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={r.testParticipation || "__none__"}
                                onValueChange={(v) =>
                                  updateResponsibleDraft(r.id, { testParticipation: v === "__none__" ? null : v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Velg..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-</SelectItem>
                                  {TEST_PARTICIPATION_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8",
                                      r.prerequisites ? "text-primary" : "text-muted-foreground"
                                    )}
                                    title="Forutsetninger"
                                  >
                                    <StickyNote className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-80">
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">Forutsetninger</div>
                                    <Textarea
                                      placeholder="Beskriv hvilke forutsetninger som kreves fra dette faget..."
                                      value={r.prerequisites || ""}
                                      onChange={(e) =>
                                        updateResponsibleDraft(r.id, { prerequisites: e.target.value || null })
                                      }
                                      className="min-h-[100px]"
                                    />
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                  onClick={() => removeResponsibleFromDraft(r.id)}
                                  title="Fjern"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Legg til delansvarlig</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="System (f.eks. 320.001)"
                  value={newResponsibleSystemCode}
                  onChange={(e) => setNewResponsibleSystemCode(e.target.value)}
                />
                <Select
                  value={newResponsibleDiscipline || "__none__"}
                  onValueChange={(v) => setNewResponsibleDiscipline(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Velg fag..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-</SelectItem>
                    {DISCIPLINES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button onClick={addResponsibleToDraft} disabled={busy["responsibles:save"]}>
                  + Legg til
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResponsiblesOpen(false)}
              disabled={busy["responsibles:save"]}
            >
              Avbryt
            </Button>
            <Button onClick={saveResponsiblesDraft} disabled={busy["responsibles:save"]}>
              Lagre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Testpunkt</DialogTitle>
            <DialogDescription>
              {selectedRow ? `${selectedRow.systemPart} – ${selectedRow.function}` : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedRow && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{formatCategory(selectedRow.category)}</Badge>
                <Badge className={cn("border", statusBadgeClass(selectedRow.status))}>
                  {statusLabel(selectedRow.status)}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Testutførelse</div>
                  <Textarea
                    value={editExecution}
                    onChange={(e) => setEditExecution(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Akseptkriterie</div>
                  <Textarea
                    value={editAcceptance}
                    onChange={(e) => setEditAcceptance(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Kommentarer</div>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {normalizeComments(selectedRow.comments).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Ingen kommentarer.</div>
                  ) : (
                    <div className="space-y-3">
                      {normalizeComments(selectedRow.comments).map((c) => {
                        const author = members.find((m) => m.id === c.authorId);
                        return (
                          <div key={c.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{author ? formatUser(author) : c.authorId}</span>
                              <span>
                                {format(new Date(c.createdAt), "dd.MM.yyyy HH:mm", {
                                  locale: nb,
                                })}
                              </span>
                            </div>
                            <div className="text-sm">{c.content}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Textarea
                    placeholder="Skriv en kommentar..."
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={addCommentToSelectedRow}
                      disabled={busy[`rowcomment:${selectedRow.id}`]}
                    >
                      Legg til kommentar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRow(null)}>
              Lukk
            </Button>
            <Button
              onClick={saveRowDetails}
              disabled={selectedRow ? busy[`rowdetails:${selectedRow.id}`] : false}
            >
              Lagre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deviation confirmation dialog */}
      <Dialog
        open={!!deviationDialogRow}
        onOpenChange={(open) => {
          if (!open) setDeviationDialogRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrer avvik</DialogTitle>
            <DialogDescription>
              Du er i ferd med å sette status til &quot;Avvik&quot; for dette testpunktet.
              Etter bekreftelse vil du bli bedt om å beskrive avviket i kommentarfeltet.
            </DialogDescription>
          </DialogHeader>
          {deviationDialogRow && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{formatCategory(deviationDialogRow.category)}</Badge>
              </div>
              <div className="font-medium">
                {deviationDialogRow.systemPart} – {deviationDialogRow.function}
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                {deviationDialogRow.testExecution}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationDialogRow(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeviation}
              disabled={deviationDialogRow ? busy[`row:${deviationDialogRow.id}`] : false}
            >
              Bekreft avvik
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirmRow}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slett testpunkt</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil slette dette testpunktet? Handlingen kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirmRow && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{formatCategory(deleteConfirmRow.category)}</Badge>
                <Badge className={cn("border", statusBadgeClass(deleteConfirmRow.status))}>
                  {statusLabel(deleteConfirmRow.status)}
                </Badge>
              </div>
              <div className="font-medium">
                {deleteConfirmRow.systemPart} – {deleteConfirmRow.function}
              </div>
              {deleteConfirmRow.status === "COMPLETED" && (
                <div className="text-sm text-amber-600">
                  Advarsel: Dette testpunktet er allerede fullført.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmRow(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmRow && deleteRow(deleteConfirmRow)}
              disabled={deleteConfirmRow ? busy[`row:delete:${deleteConfirmRow.id}`] : false}
            >
              Slett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal for predefined tests - visible to all users */}
      <Dialog open={adminModalOpen} onOpenChange={setAdminModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Predefinerte tester</DialogTitle>
            <DialogDescription>
              Velg funksjoner fra biblioteket for å legge til i protokollen.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {/* Existing tests list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Eksisterende tester</div>
                {adminSelectedFunction && (
                  <Button
                    size="sm"
                    onClick={() => {
                      createRowsFromFunctionGroup(adminSelectedFunction);
                      setAdminSelectedFunction(null);
                    }}
                    disabled={busy[`row:add_group:${adminSelectedFunction.systemGroup ?? ""}:${adminSelectedFunction.systemType ?? ""}:${adminSelectedFunction.function}`]}
                  >
                    Importer til protokoll
                  </Button>
                )}
              </div>

              {/* Search input */}
              <Input
                placeholder="Søk i System, Type eller Funksjon..."
                value={adminSearchQuery}
                onChange={(e) => {
                  setAdminSearchQuery(e.target.value);
                  setAdminSelectedFunction(null);
                }}
                className="h-9"
              />

              {adminContextFilter && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                  <span>
                    Filtrert: {adminContextFilter.systemGroup} · {adminContextFilter.systemType} ·{" "}
                    {adminContextFilter.functionName}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdminContextFilter(null)}
                  >
                    Vis alle
                  </Button>
                </div>
              )}
              <div className="rounded-lg border border-border">
                {adminPredefinedTestsLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Henter testmaler...
                  </div>
                ) : groupedAdminFunctions.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {adminSearchQuery
                      ? "Ingen testmaler matcher søket."
                      : adminContextFilter
                        ? "Ingen testmaler matcher filteret."
                        : "Ingen predefinerte tester finnes ennå."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[160px]">System</TableHead>
                        <TableHead className="w-[180px]">Type</TableHead>
                        <TableHead>Funksjon</TableHead>
                        <TableHead className="w-[80px] text-right">Tester</TableHead>
                        {isAdmin && <TableHead className="w-[80px]">Behandle</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedAdminFunctions.map((group) => {
                        const key = `${group.systemGroup ?? ""}||${group.systemType ?? ""}||${group.function}`;
                        const isSelected =
                          adminSelectedFunction?.systemGroup === group.systemGroup &&
                          adminSelectedFunction?.systemType === group.systemType &&
                          adminSelectedFunction?.function === group.function;
                        return (
                          <TableRow
                            key={key}
                            className={cn(
                              "cursor-pointer transition-colors",
                              isSelected
                                ? "bg-primary/10 hover:bg-primary/15"
                                : "hover:bg-muted/50"
                            )}
                            onClick={() => setAdminSelectedFunction(isSelected ? null : group)}
                          >
                            <TableCell className="text-sm font-medium">
                              {group.systemGroup ?? "Generelt"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {group.systemType ?? "Ukjent type"}
                            </TableCell>
                            <TableCell className="text-sm">{group.function}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">
                              {group.testCount}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    adminDeleteFunctionGroup(group);
                                  }}
                                  disabled={busy[`admin:delete_group:${group.systemGroup ?? ""}:${group.systemType ?? ""}:${group.function}`]}
                                  title="Slett alle testmaler for denne funksjonen"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            {/* Edit form - shown when editing (Admin only) */}
            {isAdmin && adminEditingTest && (
              <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Rediger testmal</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdminEditingTest(null)}
                  >
                    Avbryt
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Kategori</label>
                    <Select
                      value={adminEditingTest.category}
                      onValueChange={(v) => {
                        if (isFunctionTestCategory(v)) {
                          setAdminEditingTest((prev) => prev ? { ...prev, category: v } : prev);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="START_STOP">Start/Stopp</SelectItem>
                        <SelectItem value="SECURITY">Sikkerhet</SelectItem>
                        <SelectItem value="REGULATION">Regulering</SelectItem>
                        <SelectItem value="EXTERNAL">Ekstern</SelectItem>
                        <SelectItem value="OTHER">Øvrig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">System</label>
                    <Input
                      value={adminEditingTest.systemGroup ?? ""}
                      onChange={(e) =>
                        setAdminEditingTest((prev) =>
                          prev ? { ...prev, systemGroup: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Type</label>
                    <Input
                      value={adminEditingTest.systemType ?? adminEditingTest.systemPart}
                      onChange={(e) =>
                        setAdminEditingTest((prev) =>
                          prev ? { ...prev, systemType: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Funksjon</label>
                    <Input
                      value={adminEditingTest.function}
                      onChange={(e) =>
                        setAdminEditingTest((prev) =>
                          prev ? { ...prev, function: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Testutførelse</label>
                  <Textarea
                    value={adminEditingTest.testExecution}
                    onChange={(e) =>
                      setAdminEditingTest((prev) => prev ? { ...prev, testExecution: e.target.value } : prev)
                    }
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Akseptkriterie</label>
                  <Textarea
                    value={adminEditingTest.acceptanceCriteria}
                    onChange={(e) =>
                      setAdminEditingTest((prev) => prev ? { ...prev, acceptanceCriteria: e.target.value } : prev)
                    }
                    className="min-h-[80px]"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={adminUpdatePredefinedTest}
                    disabled={busy[`admin:update:${adminEditingTest.id}`]}
                  >
                    Oppdater
                  </Button>
                </div>
              </div>
            )}

            {/* Create new form (Admin only) */}
            {isAdmin && !adminEditingTest && (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="text-sm font-medium">Legg til ny predefinert test</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Kategori</label>
                    <Select
                      value={adminNewTest.category}
                      onValueChange={(v) => {
                        if (isFunctionTestCategory(v)) {
                          setAdminNewTest((prev) => ({ ...prev, category: v }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="START_STOP">Start/Stopp</SelectItem>
                        <SelectItem value="SECURITY">Sikkerhet</SelectItem>
                        <SelectItem value="REGULATION">Regulering</SelectItem>
                        <SelectItem value="EXTERNAL">Ekstern</SelectItem>
                        <SelectItem value="OTHER">Øvrig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">System</label>
                    <Input
                      placeholder="f.eks. Ventilasjon"
                      value={adminNewTest.systemGroup}
                      onChange={(e) =>
                        setAdminNewTest((prev) => ({ ...prev, systemGroup: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Type</label>
                    <Input
                      placeholder="f.eks. Avkastsystemer"
                      value={adminNewTest.systemType}
                      onChange={(e) =>
                        setAdminNewTest((prev) => ({ ...prev, systemType: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Funksjon</label>
                    <Input
                      placeholder="f.eks. Avkastvifte, drift og feil"
                      value={adminNewTest.function}
                      onChange={(e) =>
                        setAdminNewTest((prev) => ({ ...prev, function: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Testutførelse</label>
                  <Textarea
                    placeholder="Beskriv hvordan testen skal utføres..."
                    value={adminNewTest.testExecution}
                    onChange={(e) => setAdminNewTest((prev) => ({ ...prev, testExecution: e.target.value }))}
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Akseptkriterie</label>
                  <Textarea
                    placeholder="Beskriv hva som utgjør et godkjent testresultat..."
                    value={adminNewTest.acceptanceCriteria}
                    onChange={(e) => setAdminNewTest((prev) => ({ ...prev, acceptanceCriteria: e.target.value }))}
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Importer testprosedyre (Excel)</div>
                    {adminImportRows.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAdminImportRows([])}
                      >
                        Tøm
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mal: TestutførelsesMal.xlsx (System, Type, Funksjon, Kategori, Testutførelse,
                    Akseptkriterier).
                  </p>
                  <div className="text-xs text-muted-foreground">
                    System, Type og Funksjon leses fra filen.
                  </div>
                  <Input
                    ref={adminImportInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAdminImportFile(file);
                    }}
                  />
                  {adminImportRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                        <div className="divide-y divide-border">
                          {adminImportRows.map((row, idx) => {
                            const systemGroupLabel = row.systemGroup.trim() || "Generelt";
                            const systemTypeLabel = row.systemType.trim() || "Ukjent type";

                            return (
                              <div
                                key={`${systemGroupLabel}-${systemTypeLabel}-${row.functionName}-${idx}`}
                                className="space-y-1 p-3"
                              >
                                <div className="text-xs text-muted-foreground">
                                  {systemGroupLabel} · {systemTypeLabel}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium">{row.functionName}</div>
                                  <Badge variant="outline" className="text-xs">
                                    {formatCategory(row.category)}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-2">
                                  {row.testExecution}
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-2">
                                  {row.acceptanceCriteria}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={handleAdminImportSubmit} disabled={busy["admin:import"]}>
                          {busy["admin:import"] ? "Importerer..." : `Importer ${adminImportRows.length}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      adminCreatePredefinedTest();
                    }}
                    disabled={busy["admin:create"]}
                  >
                    Lagre og ny
                  </Button>
                  <Button
                    onClick={() => {
                      adminCreatePredefinedTest().then(() => {
                        // Keep modal open for adding more
                      });
                    }}
                    disabled={busy["admin:create"]}
                  >
                    Lagre
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAdminModalOpen(false)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send rows to other systems modal */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Send tester til andre systemer</DialogTitle>
            <DialogDescription>
              Kopier testrader til andre funksjonstester i prosjektet. Radene vil bli opprettet med status &quot;Ikke startet&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              Alle <span className="font-medium">{rows.length}</span> testrader vil bli kopiert til valgte systemer.
            </div>

            {/* Target systems */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Velg målsystemer</label>
              <div className="rounded-lg border border-border max-h-[200px] overflow-y-auto">
                {sendTargetSystemsLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Henter systemer...
                  </div>
                ) : sendTargetSystems.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Ingen andre systemer funnet i prosjektet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {sendTargetSystems.map((system) => (
                      <label
                        key={system.id}
                        className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={sendSelectedSystemIds.has(system.id)}
                          onCheckedChange={(checked) => {
                            setSendSelectedSystemIds((prev) => {
                              const next = new Set(prev);
                              if (checked) {
                                next.add(system.id);
                              } else {
                                next.delete(system.id);
                              }
                              return next;
                            });
                          }}
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">{system.systemCode}</span>
                          {system.systemName && (
                            <span className="text-sm text-muted-foreground">{system.systemName}</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {sendTargetSystems.length > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{sendSelectedSystemIds.size} av {sendTargetSystems.length} systemer valgt</span>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => {
                      if (sendSelectedSystemIds.size === sendTargetSystems.length) {
                        setSendSelectedSystemIds(new Set());
                      } else {
                        setSendSelectedSystemIds(new Set(sendTargetSystems.map((s) => s.id)));
                      }
                    }}
                  >
                    {sendSelectedSystemIds.size === sendTargetSystems.length ? "Fjern alle" : "Velg alle"}
                  </button>
                </div>
              )}
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={sendRowsToSystems}
              disabled={busy["send:rows"] || sendSelectedSystemIds.size === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export validation dialog */}
      <Dialog open={exportValidationOpen} onOpenChange={setExportValidationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Validering før eksport
            </DialogTitle>
            <DialogDescription>
              Følgende problemer ble funnet. Du kan likevel eksportere, men det anbefales å løse problemene først.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {exportValidationIssues.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-red-600">Feil som bør rettes:</div>
                <ul className="space-y-1">
                  {exportValidationIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-red-500">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {exportValidationWarnings.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-amber-600">Advarsler:</div>
                <ul className="space-y-1">
                  {exportValidationWarnings.map((warning, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-500">•</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportValidationOpen(false)}>
              Gå tilbake
            </Button>
            <Button onClick={performExport}>
              Eksporter likevel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Modal */}
      <SendEmailModal
        open={showEmailModal}
        onOpenChange={setShowEmailModal}
        projectId={project.id}
        itemType="FUNCTION_TEST"
        itemId={functionTest.id}
        itemName={functionTest.systemName || functionTest.systemCode}
      />
    </div>
  );
}
