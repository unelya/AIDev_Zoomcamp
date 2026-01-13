import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { columnConfigByRole } from "@/data/mockData";
import { fetchPlannedAnalyses, fetchSamples, mapApiAnalysis } from "@/lib/api";
import { KanbanCard, PlannedAnalysisCard, Role, Status } from "@/types/kanban";

const DEFAULT_ANALYSIS_TYPES = ["SARA", "IR", "Mass Spectrometry", "Viscosity"];
const ADMIN_STORED_KEY = "labsync-admin-stored";
const DELETED_KEY = "labsync-deleted";

const MOCK_NGDUS = ["NGDU-01", "NGDU-07", "NGDU-12", "NGDU-19"];
const MOCK_WELLS = ["W-112", "W-204", "W-318", "W-421", "W-510"];
const MOCK_SHOPS = ["Shop North", "Shop East", "Shop South", "Shop West"];
const MOCK_FIELDS = ["Field A", "Field B", "Field C", "Field D"];

const hashSeed = (value?: string) =>
  (value ?? "").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

const addDays = (dateStr: string, days: number) => {
  const base = new Date(dateStr);
  if (Number.isNaN(base.getTime())) return "—";
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next.toISOString().slice(0, 10);
};

const sampleLabelForRole = (role: Role, status: Status, adminStored?: boolean, deleted?: boolean) => {
  if (role === "admin") {
    if (deleted) return "Deleted";
    if (adminStored) return "Stored";
    if (status === "review") return "Needs attention";
    if (status === "done") return "Issues";
    return "Issues";
  }
  return columnConfigByRole[role].find((col) => col.id === status)?.title ?? "—";
};

const mergeMethods = (
  methods: { name: string; status: PlannedAnalysisCard["status"]; assignedTo?: string[] }[],
) => {
  const priority: Record<PlannedAnalysisCard["status"], number> = {
    completed: 4,
    review: 3,
    in_progress: 2,
    planned: 1,
    failed: 0,
  };
  const map = new Map<string, { name: string; status: PlannedAnalysisCard["status"]; assignedTo?: string[] }>();
  methods.forEach((method) => {
    const name = method.name ?? "Unknown";
    const key = name.toLowerCase();
    const existing = map.get(key);
    const nextAssignees = Array.from(
      new Set([...(existing?.assignedTo ?? []), ...(method.assignedTo ?? [])]),
    ).filter(Boolean);
    if (!existing || priority[method.status] > priority[existing.status]) {
      map.set(key, { ...method, name, assignedTo: nextAssignees });
      return;
    }
    map.set(key, { ...existing, name, assignedTo: nextAssignees });
  });
  return Array.from(map.values());
};

const aggregateStatus = (methods: { status: PlannedAnalysisCard["status"] }[], fallback: Status) => {
  if (methods.length === 0) return fallback;
  const allDone = methods.every((m) => m.status === "completed");
  if (fallback === "review") return "review";
  if (fallback === "done" && allDone) return "done";
  const hasReview = methods.some((m) => m.status === "review" || m.status === "failed");
  const hasProgress = methods.some((m) => m.status === "in_progress");
  if (hasReview) return "review";
  if (allDone) return fallback === "review" ? "review" : "progress";
  if (hasProgress) return "progress";
  return fallback ?? "new";
};

const Samples = () => {
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [analyses, setAnalyses] = useState<PlannedAnalysisCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [samples, planned] = await Promise.all([fetchSamples(), fetchPlannedAnalyses()]);
        setCards(samples);
        const normalized = planned.map((item) => mapApiAnalysis(item as any));
        setAnalyses(normalized);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const rows = useMemo(() => {
    const adminStoredRaw = typeof window !== "undefined" ? localStorage.getItem(ADMIN_STORED_KEY) : null;
    const deletedRaw = typeof window !== "undefined" ? localStorage.getItem(DELETED_KEY) : null;
    const adminStored = (adminStoredRaw ? JSON.parse(adminStoredRaw) : {}) as Record<string, boolean>;
    const deleted = (deletedRaw ? JSON.parse(deletedRaw) : {}) as Record<string, { reason: string }>;
    const sampleMap = new Map<string, KanbanCard>();
    cards
      .filter((card) => card.sampleId && card.sampleId.trim())
      .forEach((card) => sampleMap.set(card.sampleId, card));
    analyses.forEach((analysis) => {
      if (!analysis.sampleId || !analysis.sampleId.trim()) return;
      if (!sampleMap.has(analysis.sampleId)) {
        sampleMap.set(analysis.sampleId, {
          id: analysis.sampleId,
          status: "new",
          statusLabel: "Planned",
          sampleId: analysis.sampleId,
          wellId: "—",
          horizon: "—",
          samplingDate: "—",
          storageLocation: "Unassigned",
          analysisType: "Sample",
          assignedTo: "Unassigned",
          analysisStatus: "planned",
          sampleStatus: "new",
        });
      }
    });

    const analysesBySample = new Map<string, PlannedAnalysisCard[]>();
    analyses.forEach((analysis) => {
      const list = analysesBySample.get(analysis.sampleId) ?? [];
      list.push(analysis);
      analysesBySample.set(analysis.sampleId, list);
    });

    return Array.from(sampleMap.values()).map((card) => {
      const seed = hashSeed(card.sampleId);
      const plannedList = analysesBySample.get(card.sampleId) ?? [];
      const merged = mergeMethods(
        plannedList.map((method) => ({
          name: method.analysisType,
          status: method.status,
          assignedTo: method.assignedTo ?? [],
        })),
      );
      const methodNames = new Set<string>([
        ...DEFAULT_ANALYSIS_TYPES,
        ...merged.map((m) => m.name),
      ]);
      const methods = Array.from(methodNames).map((name) => {
        const existing = merged.find((m) => m.name.toLowerCase() === name.toLowerCase());
        const status = existing?.status ?? "planned";
        const assignees = existing?.assignedTo?.filter(Boolean) ?? [];
        return {
          name,
          status,
          done: status === "completed",
          assignees,
        };
      });

      const labStatus = aggregateStatus(methods, card.status);
      const analysisBadge = columnConfigByRole.lab_operator.find((col) => col.id === labStatus)?.title ?? "Planned";

      return {
        card,
        adminStored: Boolean(adminStored[card.sampleId]),
        deleted: Boolean(deleted[card.sampleId]),
        ngdu: MOCK_NGDUS[seed % MOCK_NGDUS.length],
        wellNumber: MOCK_WELLS[seed % MOCK_WELLS.length],
        shop: MOCK_SHOPS[seed % MOCK_SHOPS.length],
        field: MOCK_FIELDS[seed % MOCK_FIELDS.length],
        injectionWell: seed % 2 === 0,
        arrivalDate: card.samplingDate && card.samplingDate !== "—" ? addDays(card.samplingDate, (seed % 5) + 1) : "—",
        methods,
        analysisBadge,
      };
    });
  }, [cards, analyses]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Samples</p>
            <h2 className="text-xl font-semibold text-foreground">Sample registry</h2>
            <p className="text-sm text-muted-foreground">All unique samples and analysis statuses.</p>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead>Sample ID</TableHead>
                  <TableHead>Well ID</TableHead>
                  <TableHead>NGDU</TableHead>
                  <TableHead>Well number</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Injection well</TableHead>
                  <TableHead>Horizon</TableHead>
                  <TableHead>Sampling date</TableHead>
                  <TableHead>Arrival date</TableHead>
                  <TableHead>Storage location</TableHead>
                  <TableHead>Sample status</TableHead>
                  <TableHead>Analysis status</TableHead>
                  <TableHead>Admin status</TableHead>
                  <TableHead>Analyses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={15} className="text-muted-foreground">
                      Loading samples…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={15} className="text-muted-foreground">
                      No samples yet.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  rows.map((row, index) => (
                    <TableRow key={row.card.sampleId}>
                      <TableCell className="text-right text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">{row.card.sampleId}</TableCell>
                      <TableCell>{row.card.wellId}</TableCell>
                      <TableCell>{row.ngdu}</TableCell>
                      <TableCell>{row.wellNumber}</TableCell>
                      <TableCell>{row.shop}</TableCell>
                      <TableCell>{row.field}</TableCell>
                      <TableCell>{row.injectionWell ? "Yes" : "No"}</TableCell>
                      <TableCell>{row.card.horizon}</TableCell>
                      <TableCell>{row.card.samplingDate}</TableCell>
                      <TableCell>{row.arrivalDate}</TableCell>
                      <TableCell>{row.card.storageLocation}</TableCell>
                      <TableCell>{sampleLabelForRole("warehouse_worker", row.card.status)}</TableCell>
                      <TableCell>{sampleLabelForRole("lab_operator", aggregateStatus(row.methods, row.card.status))}</TableCell>
                      <TableCell>{sampleLabelForRole("admin", row.card.status, row.adminStored, row.deleted)}</TableCell>
                      <TableCell className="min-w-[520px]">
                        <div className="grid grid-cols-[minmax(140px,1.2fr)_60px_minmax(140px,1fr)] gap-2 text-[11px] text-muted-foreground pb-2 border-b border-border">
                          <span>Method</span>
                          <span>Done</span>
                          <span>Operators</span>
                        </div>
                        <div className="space-y-2 pt-2">
                          {row.methods.map((method) => (
                            <div
                              key={method.name}
                              className="grid grid-cols-[minmax(140px,1.2fr)_60px_minmax(140px,1fr)] gap-2 text-xs"
                            >
                              <span className="font-medium text-foreground">{method.name}</span>
                              <span>{method.done ? "Yes" : "No"}</span>
                              <span className="text-muted-foreground">
                                {method.assignees.length > 0 ? method.assignees.join(", ") : "Unassigned"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Samples;
