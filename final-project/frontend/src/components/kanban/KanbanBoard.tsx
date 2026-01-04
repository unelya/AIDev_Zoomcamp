import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, SlidersHorizontal } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { DetailPanel } from './DetailPanel';
import { getColumnData, getMockCards, columnConfigByRole } from '@/data/mockData';
import { KanbanCard, NewCardPayload, PlannedAnalysisCard, Role } from '@/types/kanban';
import { Button } from '@/components/ui/button';
import { NewCardDialog } from './NewCardDialog';
import { createActionBatch, createConflict, createPlannedAnalysis, createSample, fetchActionBatches, fetchConflicts, fetchPlannedAnalyses, fetchSamples, mapApiAnalysis, resolveConflict, updatePlannedAnalysis, updateSampleFields, updateSampleStatus } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';

const STORAGE_KEY = 'labsync-kanban-cards';
const DEFAULT_ANALYSIS_TYPES = ['SARA', 'NMR', 'FTIR', 'Mass Spectrometry', 'Viscosity'];
const METHOD_BLACKLIST = ['fsf', 'dadq'];

const roleCopy: Record<Role, string> = {
  warehouse_worker: 'Warehouse view: samples and storage',
  lab_operator: 'Lab view: planned analyses',
  action_supervision: 'Action supervision view',
  admin: 'Admin view',
};

export function KanbanBoard({ role, searchTerm }: { role: Role; searchTerm?: string }) {
  const { user } = useAuth();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [plannedAnalyses, setPlannedAnalyses] = useState<PlannedAnalysisCard[]>([]);
  const [actionBatches, setActionBatches] = useState<{ id: number; title: string; date: string; status: string }[]>([]);
  const [conflicts, setConflicts] = useState<{ id: number; old_payload: string; new_payload: string; status: string; resolution_note?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { toast } = useToast();
  const [initialLoad, setInitialLoad] = useState(true);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string[]>([]);
  const [assignedOnly, setAssignedOnly] = useState(false);

  useEffect(() => {
    // keep detail panel in sync with card state and latest methods
    if (selectedCard) {
      const updatedCard = cards.find((c) => c.id === selectedCard.id);
      const methodsFromAnalyses = plannedAnalyses
        .filter((pa) => pa.sampleId === selectedCard.sampleId && !METHOD_BLACKLIST.includes(pa.analysisType))
        .map((pa) => ({ id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo }));
      const merged = {
        ...selectedCard,
        ...(updatedCard ?? {}),
        methods: methodsFromAnalyses.length > 0 ? methodsFromAnalyses : selectedCard.methods,
      };
      if (merged.methods) {
        const { allDone } = aggregateStatus(merged.methods, merged.status);
        merged.allMethodsDone = allDone;
      }
      setSelectedCard(merged);
    }
  }, [cards, plannedAnalyses, selectedCard]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [remoteSamples, remoteAnalyses, batches, conflictList] = await Promise.all([
          fetchSamples(),
          fetchPlannedAnalyses(),
          fetchActionBatches(),
          fetchConflicts(),
        ]);
        setCards(remoteSamples);
        setPlannedAnalyses(remoteAnalyses.filter((pa) => !METHOD_BLACKLIST.includes(pa.analysis_type)).map(mapApiAnalysis));
        setActionBatches(batches);
        setConflicts(conflictList);
      } catch (err) {
        toast({
          title: "Failed to load data",
          description: err instanceof Error ? err.message : "Backend unreachable",
          variant: "destructive",
        });
        setCards(getMockCards());
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    };
    load();
  }, []);

  const filterCards = useCallback(
    (list: KanbanCard[]) => {
      const query = searchTerm?.trim().toLowerCase();
      if (!query) return list;
      return list.filter((card) => {
        const haystack = [
          card.sampleId,
          card.wellId,
          card.horizon,
          card.analysisType,
          card.assignedTo,
          card.storageLocation,
          card.statusLabel,
          card.conflictOld,
          card.conflictNew,
          card.conflictResolutionNote,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    },
    [searchTerm],
  );

  const columns = useMemo(() => {
    if (role === 'lab_operator') {
      const bySample = new Map<string, KanbanCard>();
      cards.forEach((sample) => {
        bySample.set(sample.sampleId, {
          ...sample,
          analysisType: 'Sample',
          statusLabel: columnConfigByRole[role]?.find((c) => c.id === sample.status)?.title ?? 'Planned',
          methods: [],
          allMethodsDone: false,
        });
      });

      plannedAnalyses.forEach((pa) => {
        if (METHOD_BLACKLIST.includes(pa.analysisType)) return;
        const card = bySample.get(pa.sampleId);
        if (!card) return;
        const nextMethods = [
          ...(card.methods ?? []),
          { id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo },
        ];
        card.methods = nextMethods;
        const methodAssignee = nextMethods.find((m) => m.assignedTo)?.assignedTo;
        if (methodAssignee) {
          card.assignedTo = methodAssignee;
        }
        const { aggStatus, allDone } = aggregateStatus(nextMethods, card.status);
        card.status = aggStatus;
        card.statusLabel = columnConfigByRole[role]?.find((c) => c.id === aggStatus)?.title ?? card.statusLabel;
        card.analysisStatus =
          aggStatus === 'progress' && allDone
            ? 'completed'
            : aggStatus === 'progress'
            ? 'in_progress'
            : aggStatus === 'review'
            ? 'review'
            : 'planned';
        card.allMethodsDone = allDone;
      });
      // remove cards that have no methods (e.g., all filtered out)
      let cardsWithMethods = [...bySample.values()].filter((c) => c.methods && c.methods.length > 0);
      const userName = user?.fullName?.trim().toLowerCase();
      if (assignedOnly) {
        if (!userName) {
          cardsWithMethods = [];
        } else {
          cardsWithMethods = cardsWithMethods.filter(
            (c) =>
              c.assignedTo?.trim().toLowerCase() === userName ||
              c.methods?.some((m) => m.assignedTo?.trim().toLowerCase() === userName),
          );
        }
      }
      const filteredByMethods =
        methodFilter.length === 0
          ? cardsWithMethods
          : cardsWithMethods.filter((c) => c.methods?.some((m) => methodFilter.includes(m.name)));

      return getColumnData(filterCards(filteredByMethods), role);
    }
    if (role === 'admin') {
      // Compose admin view: Needs attention (lab review), Conflicts (action conflicts), Resolved empty, Deleted empty
      const adminCards: KanbanCard[] = [];
      // Lab needs attention (mirror lab view with current filters)
      const labMap = new Map<string, KanbanCard>();
      cards.forEach((sample) => {
        labMap.set(sample.sampleId, {
          ...sample,
          analysisType: 'Sample',
          statusLabel: columnConfigByRole.lab_operator.find((c) => c.id === sample.status)?.title ?? 'Planned',
          methods: [],
          allMethodsDone: false,
        });
      });
      plannedAnalyses.forEach((pa) => {
        if (METHOD_BLACKLIST.includes(pa.analysisType)) return;
        const card = labMap.get(pa.sampleId);
        if (!card) return;
        const nextMethods = [
          ...(card.methods ?? []),
          { id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo },
        ];
        card.methods = nextMethods;
        const { aggStatus, allDone } = aggregateStatus(nextMethods, card.status);
        card.status = aggStatus;
        card.statusLabel = columnConfigByRole.lab_operator.find((c) => c.id === aggStatus)?.title ?? card.statusLabel;
        card.allMethodsDone = allDone;
      });
      let labCards = [...labMap.values()].filter((c) => c.methods && c.methods.length > 0);
      const userName = user?.fullName?.trim().toLowerCase();
      if (assignedOnly) {
        if (!userName) {
          labCards = [];
        } else {
          labCards = labCards.filter(
            (c) =>
              c.assignedTo?.trim().toLowerCase() === userName ||
              c.methods?.some((m) => m.assignedTo?.trim().toLowerCase() === userName),
          );
        }
      }
      labCards =
        methodFilter.length === 0
          ? labCards
          : labCards.filter((c) => c.methods?.some((m) => methodFilter.includes(m.name)));
      const labNeeds = getColumnData(filterCards(labCards), 'lab_operator').find((col) => col.id === 'review')?.cards ?? [];
      labNeeds.forEach((c) => adminCards.push({ ...c, status: 'review', statusLabel: 'Needs attention' }));

      // admin "Resolved" currently unused; leave empty

      // Conflicts same as action supervision
      // Conflicts mirror action supervision "Conflicts" (unresolved only)
      conflicts
        .filter((c) => c.status !== 'resolved')
        .forEach((c) => {
          adminCards.push({
            id: `conflict-${c.id}`,
            status: 'progress',
            statusLabel: 'Conflicts',
            sampleId: `Conflict ${c.id}`,
            wellId: '',
            horizon: '',
            samplingDate: '',
            storageLocation: '—',
            analysisType: 'Conflict',
            assignedTo: 'Action supervisor',
            analysisStatus: 'review',
            sampleStatus: 'received',
            conflictOld: c.old_payload,
            conflictNew: c.new_payload,
            conflictResolutionNote: c.resolution_note,
          });
        });

      return getColumnData(filterCards(adminCards), role);
    }
    if (role === 'action_supervision') {
      const batchCards: KanbanCard[] = actionBatches.map((b) => ({
        id: `batch-${b.id}`,
        status: toKanbanStatus(b.status),
        statusLabel: columnConfigByRole[role]?.find((c) => c.id === toKanbanStatus(b.status))?.title ?? 'Uploaded batch',
        sampleId: b.title,
        wellId: b.date,
        horizon: '',
        samplingDate: b.date,
        storageLocation: '—',
        analysisType: 'Batch',
        assignedTo: 'Action supervisor',
        analysisStatus: 'planned',
        sampleStatus: 'received',
      }));
      const conflictCards: KanbanCard[] = conflicts.map((c) => ({
        id: `conflict-${c.id}`,
        status: c.status === 'resolved' ? 'done' : 'progress',
        statusLabel: c.status === 'resolved' ? 'Resolved' : 'Conflicts',
        sampleId: `Conflict ${c.id}`,
        wellId: '',
        horizon: '',
        samplingDate: '',
        storageLocation: '—',
        analysisType: 'Conflict',
        assignedTo: 'Action supervisor',
        analysisStatus: 'review',
        sampleStatus: 'received',
        conflictOld: c.old_payload,
        conflictNew: c.new_payload,
        conflictResolutionNote: c.resolution_note,
      }));
      return getColumnData(filterCards([...batchCards, ...conflictCards]), role);
    }
    return getColumnData(filterCards(cards), role);
  }, [cards, plannedAnalyses, actionBatches, conflicts, role, filterCards, methodFilter, assignedOnly, user?.fullName]);
  const handleCardClick = (card: KanbanCard) => {
    // ensure methods are attached for the detail panel even if this card came from a role/column that does not render them
    const methodsFromAnalyses =
      plannedAnalyses
        .filter((pa) => pa.sampleId === card.sampleId && !METHOD_BLACKLIST.includes(pa.analysisType))
        .map((pa) => ({ id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo })) || [];
    const mergedMethods = card.methods?.length ? card.methods : methodsFromAnalyses;
    setSelectedCard({ ...card, methods: mergedMethods });
    setIsPanelOpen(true);
  };
  
  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCard(null), 300);
  };

  const handleDropToColumn = (columnId: KanbanCard['status']) => (cardId: string) => {
    if (role === 'warehouse_worker' && columnId === 'review') {
      const target = cards.find((c) => c.id === cardId);
      if (target && !target.storageLocation) {
        const location = window.prompt('Storage location is required to store this sample. Please enter it:');
        if (!location) return;
        handleSampleFieldUpdate(target.sampleId, { storage_location: location, status: 'review' });
        return;
      }
    }

    const analysis = plannedAnalyses.find((a) => a.id.toString() === cardId);
    if (analysis) {
      setPlannedAnalyses((prev) =>
        prev.map((pa) => (pa.id === analysis.id ? { ...pa, status: toAnalysisStatus(columnId) } : pa)),
      );
      updatePlannedAnalysis(analysis.id, toAnalysisStatus(columnId)).catch(() => {});
      return;
    }
    const conflict = conflicts.find((c) => `conflict-${c.id}` === cardId);
    if (conflict) {
      setConflicts((prev) =>
        prev.map((c) => (c.id === conflict.id ? { ...c, status: 'resolved', resolution_note: c.resolution_note } : c)),
      );
      resolveConflict(conflict.id).catch(() => {});
      return;
    }

    // Lab operator: aggregated sample cards; block forbidden moves, never change method statuses via drag
    if (role === 'lab_operator') {
      const sampleAnalyses = plannedAnalyses.filter((pa) => pa.sampleId === cardId);
      const allDone = sampleAnalyses.length > 0 && sampleAnalyses.every((pa) => pa.status === 'completed');
      const currentCard = cards.find((c) => c.id === cardId);
      // allow moving into review; block moving out of review for lab-only users (no admin)
      if (currentCard?.status === 'review' && columnId !== 'review' && user?.role !== 'admin') {
        toast({
          title: "Locked in Needs attention",
          description: "This card must stay in Needs attention until an admin clears it.",
          variant: "default",
        });
        return;
      }
      if (columnId === 'done') {
        toast({
          title: "Cannot move to Completed",
          description: "Completion will be handled automatically when ready.",
          variant: "default",
        });
        return;
      }
      if (columnId === 'new') {
        toast({
          title: "Cannot move to Planned",
          description: "In-progress items stay active; send to Needs attention if required.",
          variant: "default",
        });
        return;
      }
      if (allDone && (columnId === 'done' || columnId === 'new')) {
        toast({
          title: "Auto-complete only",
          description: "All methods are done; move only to Needs attention if required.",
          variant: "default",
        });
        return;
      }
      // Do not adjust method statuses on drag; only move the sample card
    }

    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              status: columnId,
              statusLabel: columns.find((c) => c.id === columnId)?.title ?? card.statusLabel,
            }
          : card,
      ),
    );
    updateSampleStatus(cardId, columnId)
      .then((updated) => {
        if (role === 'warehouse_worker' && columnId === 'review') {
          ensureAnalyses(updated.sampleId, plannedAnalyses, setPlannedAnalyses);
        }
      })
      .catch((err) =>
        toast({
          title: "Failed to update sample",
          description: err instanceof Error ? err.message : "Backend unreachable",
          variant: "destructive",
        }),
      );
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const [remoteSamples, remoteAnalyses] = await Promise.all([fetchSamples(), fetchPlannedAnalyses()]);
      setCards(remoteSamples);
      setPlannedAnalyses(remoteAnalyses.map(mapApiAnalysis));
    } catch (err) {
      toast({
        title: "Failed to refresh",
        description: err instanceof Error ? err.message : "Backend unreachable",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCard = (payload: NewCardPayload) => {
    const newLabel = columnConfigByRole[role]?.find((c) => c.id === 'new')?.title ?? 'Planned';
    createSample(payload)
      .then((card) => {
        setCards((prev) => [...prev, { ...card, statusLabel: newLabel }]);
      })
      .catch((err) => {
        toast({
          title: "Failed to create sample",
          description: err instanceof Error ? err.message : "Backend unreachable",
          variant: "destructive",
        });
        const fallback: KanbanCard = {
          id: `NEW-${Date.now()}`,
          status: 'new',
          statusLabel: newLabel,
          analysisStatus: 'planned',
          analysisType: 'Sample',
          assignedTo: 'Unassigned',
          sampleId: payload.sampleId,
          wellId: payload.wellId,
          horizon: payload.horizon,
          samplingDate: payload.samplingDate,
          storageLocation: payload.storageLocation ?? 'Unassigned',
          sampleStatus: 'new',
        };
        setCards((prev) => [...prev, fallback]);
      });
  };

  const handlePlanAnalysis = (sampleId: string) => async (data: { analysisType: string; assignedTo?: string }) => {
    try {
      const created = await createPlannedAnalysis({ sampleId, analysisType: data.analysisType, assignedTo: data.assignedTo });
      setPlannedAnalyses((prev) => [...prev, mapApiAnalysis(created)]);
    } catch (err) {
      toast({
        title: "Failed to plan analysis",
        description: err instanceof Error ? err.message : "Backend unreachable",
        variant: "destructive",
      });
    }
  };

  const handleResolveConflict = (conflictId: number) => async (note?: string) => {
    try {
      const updated = await resolveConflict(conflictId, note);
      setConflicts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      // ignore for now
    }
  };

  const toggleMethodStatus = async (methodId: number, done: boolean) => {
    const sampleIdFromMethod = plannedAnalyses.find((pa) => pa.id === methodId)?.sampleId;
    if (role === 'lab_operator' && sampleIdFromMethod) {
      const targetCard = cards.find((c) => c.id === sampleIdFromMethod);
      if (targetCard?.status === 'review' && user?.role !== 'admin') {
        return;
      }
    }
    const nextStatus = done ? 'completed' : 'planned';
    setPlannedAnalyses((prev) => {
      const updated = prev.map((pa) => (pa.id === methodId ? { ...pa, status: nextStatus as PlannedAnalysisCard['status'] } : pa));
      const sampleId = updated.find((pa) => pa.id === methodId)?.sampleId;
      if (sampleId) {
        const methods = updated.filter((pa) => pa.sampleId === sampleId);
        const allDone = methods.length > 0 && methods.every((m) => m.status === 'completed');
        setCards((cardsPrev) =>
          cardsPrev.map((c) => (c.id === sampleId ? { ...c, allMethodsDone: allDone } : c)),
        );
      }
      return updated;
    });
    try {
      await updatePlannedAnalysis(methodId, nextStatus);
    } catch (err) {
      toast({
        title: "Failed to update method",
        description: err instanceof Error ? err.message : "Backend unreachable",
        variant: "destructive",
      });
      // rollback
      setPlannedAnalyses((prev) => prev.map((pa) => (pa.id === methodId ? { ...pa, status: done ? 'planned' : 'completed' } : pa)));
    }
  };

  const totalSamples = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const lockNeedsAttentionCards = role === 'lab_operator' && user?.role !== 'admin';

  const handleSampleFieldUpdate = async (sampleId: string, updates: Record<string, string>) => {
    const shouldStore =
      role === 'warehouse_worker' && updates.storage_location && updates.storage_location.trim().length > 0;
    const targetStatus = shouldStore ? 'review' : undefined;
    const statusLabel =
      targetStatus && columnConfigByRole[role]?.find((c) => c.id === targetStatus)?.title;

    setCards((prev) =>
      prev.map((card) =>
        card.sampleId === sampleId
          ? {
              ...card,
              ...mapSampleUpdates(card, updates),
              ...(targetStatus
                ? { status: targetStatus, statusLabel: statusLabel ?? card.statusLabel }
                : {}),
            }
          : card,
      ),
    );
    if (selectedCard?.sampleId === sampleId) {
      setSelectedCard((prev) =>
        prev
          ? {
              ...prev,
              ...mapSampleUpdates(prev, updates),
              ...(targetStatus
                ? { status: targetStatus, statusLabel: statusLabel ?? prev.statusLabel }
                : {}),
            }
          : prev,
      );
    }
    try {
      await updateSampleFields(sampleId, targetStatus ? { ...updates, status: targetStatus } : updates);
      if (role === 'warehouse_worker' && (targetStatus === 'review' || updates.status === 'review')) {
        ensureAnalyses(sampleId, plannedAnalyses, setPlannedAnalyses);
      }
    } catch (err) {
      toast({
        title: "Failed to update sample",
        description: err instanceof Error ? err.message : "Backend unreachable",
        variant: "destructive",
      });
    }
  };

  const handleAnalysisFieldUpdate = async (analysisId: number, updates: { assigned_to?: string }) => {
    setPlannedAnalyses((prev) =>
      prev.map((pa) => (pa.id === analysisId ? { ...pa, assignedTo: updates.assigned_to ?? pa.assignedTo } : pa)),
    );
    if (selectedCard?.id === analysisId.toString()) {
      setSelectedCard((prev) => (prev ? { ...prev, assignedTo: updates.assigned_to ?? prev.assignedTo } : prev));
    }
    try {
      await updatePlannedAnalysis(analysisId, undefined as any, updates.assigned_to);
    } catch (err) {
      toast({
        title: "Failed to update analysis",
        description: err instanceof Error ? err.message : "Backend unreachable",
        variant: "destructive",
      });
    }
  };
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Board Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {roleCopy[role]} • Sample Tracking Board
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalSamples} samples across {columns.length} stages
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                Methods {methodFilter.length > 0 ? `(${methodFilter.length})` : ''}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-56" align="end">
              <Command>
                <CommandGroup>
                  {[...new Set([...DEFAULT_ANALYSIS_TYPES, ...plannedAnalyses.map((pa) => pa.analysisType)])]
                    .filter((m) => !METHOD_BLACKLIST.includes(m))
                    .map((m) => (
                      <CommandItem
                        key={m}
                        onSelect={() => {
                          setMethodFilter((prev) =>
                            prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
                          );
                        }}
                      >
                        <Checkbox
                          checked={methodFilter.includes(m)}
                          className="mr-2 pointer-events-none"
                        />
                        <span>{m}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          {role === 'lab_operator' && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={assignedOnly}
                onCheckedChange={(val) => setAssignedOnly(Boolean(val))}
              />
              <span>Show only assigned to me</span>
            </label>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            View
          </Button>
          <NewCardDialog onCreate={handleCreateCard} open={newDialogOpen} onOpenChange={setNewDialogOpen} />
          <Button size="sm" className="gap-2" onClick={handleSave} disabled={loading}>
            {loading ? "Syncing..." : "Refresh"}
          </Button>
        </div>
      </div>
      
      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto p-6">
        {loading && initialLoad ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">Loading board...</div>
        ) : (
          <div className="flex gap-4 h-full min-w-max">
            {columns.map((column) => (
              <div key={column.id} className="w-72 flex-shrink-0">
          <KanbanColumn
            column={column}
            onCardClick={handleCardClick}
            onDropCard={handleDropToColumn(column.id)}
            showAdd={role === 'warehouse_worker' && column.id === 'new'}
            onAdd={() => setNewDialogOpen(true)}
            onToggleMethod={role === 'lab_operator' || role === 'admin' ? toggleMethodStatus : undefined}
            lockNeedsAttention={lockNeedsAttentionCards}
          />
              </div>
            ))}
          </div>
        )}
        {!loading && totalSamples === 0 && (
          <div className="mt-6 text-sm text-muted-foreground">No items yet. Create a sample or analysis to get started.</div>
        )}
      </div>
      
      {/* Detail Panel */}
      <DetailPanel
        card={selectedCard}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        onPlanAnalysis={selectedCard && selectedCard.analysisType === 'Sample' ? handlePlanAnalysis(selectedCard.sampleId) : undefined}
        onResolveConflict={
          selectedCard && selectedCard.analysisType === 'Conflict' ? handleResolveConflict(Number(selectedCard.id.replace('conflict-', ''))) : undefined
        }
        onUpdateSample={
          selectedCard && selectedCard.analysisType === 'Sample' && !(lockNeedsAttentionCards && selectedCard.status === 'review')
            ? (updates) => handleSampleFieldUpdate(selectedCard.sampleId, updates)
            : undefined
        }
        onUpdateAnalysis={
          selectedCard && selectedCard.analysisType !== 'Sample' && role === 'lab_operator' && !(lockNeedsAttentionCards && selectedCard.status === 'review')
            ? (updates) => handleAnalysisFieldUpdate(Number(selectedCard.id), updates)
            : undefined
        }
        onToggleMethod={
          selectedCard &&
          ((role === 'lab_operator' && !(lockNeedsAttentionCards && selectedCard.status === 'review')) || role === 'admin')
            ? toggleMethodStatus
            : undefined
        }
        readOnlyMethods={selectedCard ? !((role === 'lab_operator' && !(lockNeedsAttentionCards && selectedCard.status === 'review')) || role === 'admin') : false}
      />
    </div>
  );
}

function toKanbanStatus(status: string): KanbanCard['status'] {
  switch (status) {
    case 'in_progress':
      return 'progress';
    case 'review':
    case 'failed':
      return 'review';
    case 'completed':
      return 'done';
    default:
      return 'new';
  }
}

function mapSampleUpdates(card: KanbanCard, updates: Record<string, string>) {
  return {
    storageLocation: updates.storage_location ?? card.storageLocation,
    samplingDate: updates.sampling_date ?? card.samplingDate,
    wellId: updates.well_id ?? card.wellId,
    horizon: updates.horizon ?? card.horizon,
    status: (updates.status as KanbanCard['status']) ?? card.status,
    assignedTo: updates.assigned_to ?? card.assignedTo,
  };
}

function toAnalysisStatus(status: KanbanCard['status']): PlannedAnalysisCard['status'] {
  switch (status) {
    case 'progress':
      return 'in_progress';
    case 'review':
      return 'review';
    case 'done':
      return 'completed';
    default:
      return 'planned';
  }
}

async function ensureAnalyses(
  sampleId: string,
  existing: PlannedAnalysisCard[],
  setPlannedAnalyses: React.Dispatch<React.SetStateAction<PlannedAnalysisCard[]>>,
) {
  const existingTypes = new Set(existing.filter((pa) => pa.sampleId === sampleId).map((pa) => pa.analysisType));
  const missing = DEFAULT_ANALYSIS_TYPES.filter((t) => !existingTypes.has(t));
  if (missing.length === 0) return;
  for (const type of missing) {
    try {
      const created = await createPlannedAnalysis({ sampleId, analysisType: type });
      setPlannedAnalyses((prev) => [...prev, mapApiAnalysis(created)]);
    } catch {
      // ignore failures silently for now
    }
  }
}

function aggregateStatus(
  methods: { status: PlannedAnalysisCard['status'] }[],
  fallback: KanbanCard['status'],
): { aggStatus: KanbanCard['status']; allDone: boolean } {
  if (methods.length === 0) return { aggStatus: fallback, allDone: false };
  const hasReview = methods.some((m) => m.status === 'review' || m.status === 'failed');
  const allDone = methods.every((m) => m.status === 'completed');
  const hasProgress = methods.some((m) => m.status === 'in_progress');
  if (hasReview) return { aggStatus: 'review', allDone };
  if (allDone) {
    // If user placed card in review, keep it there; otherwise keep in progress with highlight
    return { aggStatus: fallback === 'review' ? 'review' : 'progress', allDone };
  }
  if (hasProgress) return { aggStatus: 'progress', allDone };
  return { aggStatus: fallback ?? 'new', allDone };
}
