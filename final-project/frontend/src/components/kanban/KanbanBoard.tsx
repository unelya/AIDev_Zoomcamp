import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, SlidersHorizontal, Undo2 } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { DetailPanel } from './DetailPanel';
import { getColumnData, getMockCards, columnConfigByRole } from '@/data/mockData';
import { KanbanCard, CommentThread, DeletedInfo, NewCardPayload, PlannedAnalysisCard, Role } from '@/types/kanban';
import { Button } from '@/components/ui/button';
import { NewCardDialog } from './NewCardDialog';
import { createActionBatch, createConflict, createPlannedAnalysis, createSample, fetchActionBatches, fetchConflicts, fetchPlannedAnalyses, fetchSamples, fetchUsers, mapApiAnalysis, resolveConflict, updatePlannedAnalysis, updateSampleFields, updateSampleStatus } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const STORAGE_KEY = 'labsync-kanban-cards';
const DEFAULT_ANALYSIS_TYPES = ['SARA', 'IR', 'Mass Spectrometry', 'Viscosity'];
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
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const analysisTypes = DEFAULT_ANALYSIS_TYPES;
  const [undoStack, setUndoStack] = useState<
    (
      | { kind: 'sample'; sampleId: string; prev: Partial<KanbanCard> }
      | { kind: 'analysis'; analysisId: number; sampleId: string; prevStatus: PlannedAnalysisCard['status']; prevAssignedTo?: string | null }
    )[]
  >([]);
  const [storagePrompt, setStoragePrompt] = useState<{ open: boolean; sampleId: string | null }>({ open: false, sampleId: null });
  const [storageValue, setStorageValue] = useState({ fridge: '', bin: '', place: '' });
  const [storageError, setStorageError] = useState('');
  const [arrivalPrompt, setArrivalPrompt] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });
  const [deletePrompt, setDeletePrompt] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });
  const [deleteReason, setDeleteReason] = useState('');
  const isAdminUser = user?.role === 'admin';
  const [issuePrompt, setIssuePrompt] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });
  const [issueReason, setIssueReason] = useState('');
  const [labOperators, setLabOperators] = useState<{ id: number; name: string }[]>([]);
  const [commentsByCard, setCommentsByCard] = useState<Record<string, CommentThread[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('labsync-comments');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [labStatusOverrides, setLabStatusOverrides] = useState<Record<string, KanbanCard['status']>>({});
  const storageFormatRegex = /^Fridge\s+[A-Za-z0-9]+\s*·\s*Bin\s+[A-Za-z0-9]+\s*·\s*Place\s+[A-Za-z0-9]+$/;
  const isValidStorageLocation = (value: string) => storageFormatRegex.test(value.trim());
  const formatStorageLocation = (parts: { fridge: string; bin: string; place: string }) =>
    `Fridge ${parts.fridge.trim()} · Bin ${parts.bin.trim()} · Place ${parts.place.trim()}`;
  const [deletedByCard, setDeletedByCard] = useState<Record<string, DeletedInfo>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('labsync-deleted');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    // keep detail panel in sync with card state and latest methods
    if (selectedCard) {
      const updatedCard = cards.find((c) => c.id === selectedCard.id);
      const methodsFromAnalyses = mergeMethods(
        plannedAnalyses
          .filter((pa) => pa.sampleId === selectedCard.sampleId && !METHOD_BLACKLIST.includes(pa.analysisType))
          .map((pa) => ({ id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo })),
      );
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
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLast();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undoStack]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [remoteSamples, remoteAnalyses, batches, conflictList, users] = await Promise.all([
          fetchSamples(),
          fetchPlannedAnalyses(),
          fetchActionBatches(),
          fetchConflicts(),
          fetchUsers().catch(() => []),
        ]);
        setCards(remoteSamples);
        const initialAnalyses = remoteAnalyses
          .filter((pa) => !METHOD_BLACKLIST.includes(pa.analysis_type))
          .map(mapApiAnalysis);
        setPlannedAnalyses(initialAnalyses);
        // ensure all default methods exist per sample (adds missing ones such as IR)
        for (const sample of remoteSamples) {
          await ensureAnalyses(sample.sampleId, initialAnalyses, setPlannedAnalyses, DEFAULT_ANALYSIS_TYPES);
        }
        setActionBatches(batches);
        setConflicts(conflictList);
        setLabOperators(
          users
            .filter((u: any) => (u.roles || []).includes('lab_operator') || u.role === 'lab_operator')
            .map((u: any) => ({ id: u.id, name: u.full_name || u.username })),
        );
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('labsync-comments', JSON.stringify(commentsByCard));
  }, [commentsByCard]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('labsync-deleted', JSON.stringify(deletedByCard));
  }, [deletedByCard]);

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
    const userName = user?.fullName?.trim().toLowerCase();
    const matchesUser = (assignee?: string | null) => {
      if (!assignee || !userName) return false;
      return assignee.trim().toLowerCase() === userName;
    };
    // Only Admin board can see deleted cards; all other boards hide them
    const visibleCards = role === 'admin' ? cards : cards.filter((c) => !deletedByCard[c.sampleId]);
    const withComments = (list: KanbanCard[]) =>
      list.map((c) => ({
        ...c,
        comments: commentsByCard[c.sampleId] ?? [],
      }));
    const hasUserAssignment = (c: KanbanCard) =>
      c.methods?.some((m) => matchesUser(m.assignedTo));
    const hasIncomplete = (c: KanbanCard) =>
      c.methods?.some((m) => m.status !== 'completed');
    const hasUserIncomplete = (c: KanbanCard) =>
      c.methods?.some((m) => matchesUser(m.assignedTo) && m.status !== 'completed');
    const analysisStatusBySampleId = new Map<string, PlannedAnalysisCard['status']>();
    const analysesBySampleId = new Map<string, PlannedAnalysisCard[]>();
    plannedAnalyses
      .filter((pa) => !METHOD_BLACKLIST.includes(pa.analysisType))
      .forEach((pa) => {
        const list = analysesBySampleId.get(pa.sampleId) ?? [];
        list.push(pa);
        analysesBySampleId.set(pa.sampleId, list);
      });
    const toLabAnalysisStatus = (aggStatus: KanbanCard['status'], allDone: boolean) => {
      if (aggStatus === 'progress' && allDone) return 'completed';
      if (aggStatus === 'progress') return 'in_progress';
      if (aggStatus === 'review') return 'review';
      if (aggStatus === 'done') return 'completed';
      return 'planned';
    };
    cards.forEach((sample) => {
      const methods =
        mergeMethods(
          (analysesBySampleId.get(sample.sampleId) ?? []).map((pa) => ({
            id: pa.id,
            name: pa.analysisType,
            status: pa.status,
            assignedTo: pa.assignedTo,
          })),
        ) ?? [];
      if (methods.length === 0) {
        analysisStatusBySampleId.set(sample.sampleId, sample.analysisStatus);
        return;
      }
      const { aggStatus, allDone } = aggregateStatus(methods, sample.status);
      analysisStatusBySampleId.set(sample.sampleId, toLabAnalysisStatus(aggStatus, allDone));
    });

    if (role === 'lab_operator') {
      const bySample = new Map<string, KanbanCard>();
      withComments(visibleCards).forEach((sample) => {
        if (sample.status !== 'review') {
          return;
        }
        const initialStatus = 'new';
        if (role !== 'admin' && deletedByCard[sample.sampleId]) {
          return;
        }
        bySample.set(sample.sampleId, {
          ...sample,
          analysisType: 'Sample',
          status: initialStatus,
          statusLabel: columnConfigByRole[role]?.find((c) => c.id === initialStatus)?.title ?? 'Planned',
          methods: [],
          comments: commentsByCard[sample.sampleId] ?? [],
          allMethodsDone: false,
        });
      });

      plannedAnalyses.forEach((pa) => {
        if (METHOD_BLACKLIST.includes(pa.analysisType)) return;
        const card = bySample.get(pa.sampleId);
        if (!card) return;
        const wasReview = card.status === 'review';
        const nextMethods = mergeMethods([
          ...(card.methods ?? []),
          { id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo },
        ]);
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
            : aggStatus === 'done'
            ? 'completed'
            : 'planned';
        card.allMethodsDone = allDone;
        // If the underlying sample was explicitly moved to Needs attention, keep it there
        if (wasReview) {
          card.status = 'review';
          card.statusLabel = columnConfigByRole[role]?.find((c) => c.id === 'review')?.title ?? 'Needs attention';
        }
        const overrideStatus = labStatusOverrides[card.sampleId];
        if (overrideStatus) {
          card.status = overrideStatus;
          card.statusLabel = columnConfigByRole[role]?.find((c) => c.id === overrideStatus)?.title ?? card.statusLabel;
          card.analysisStatus = toAnalysisStatus(overrideStatus);
        }
      });
      // remove cards that have no methods (e.g., all filtered out)
      let cardsWithMethods = [...bySample.values()].filter((c) => c.methods && c.methods.length > 0);
      // apply filters:
      if (assignedOnly && incompleteOnly) {
        // intersection: assigned to me AND has an incomplete method
        if (!userName) {
          cardsWithMethods = [];
        } else {
          cardsWithMethods = cardsWithMethods.filter((c) => hasUserAssignment(c) && hasUserIncomplete(c));
        }
      } else {
        if (incompleteOnly) {
          cardsWithMethods = cardsWithMethods.filter((c) => hasIncomplete(c));
        }
        if (assignedOnly) {
          if (!userName) {
            cardsWithMethods = [];
          } else {
            cardsWithMethods = cardsWithMethods.filter((c) => hasUserAssignment(c));
          }
        }
      }
      // apply method filter if any
      if (methodFilter.length > 0) {
        cardsWithMethods = cardsWithMethods.filter((c) => c.methods?.some((m) => methodFilter.includes(m.name)));
      }

      return getColumnData(filterCards(cardsWithMethods), role);
    }
    if (role === 'admin') {
      // Compose admin view: Needs attention (lab review), Conflicts (action conflicts), Resolved empty, Deleted empty
      const adminCards: KanbanCard[] = [];
      const deletedCards: KanbanCard[] = [];
      const getAdminStatusLabel = (card: KanbanCard, status: KanbanCard['status']) => {
        if (status === 'new') {
          return columnConfigByRole.admin.find((c) => c.id === 'new')?.title ?? 'Deleted';
        }
        if (status === 'review') {
          return columnConfigByRole.admin.find((c) => c.id === 'review')?.title ?? 'Needs attention';
        }
        if (status === 'progress') {
          return columnConfigByRole.admin.find((c) => c.id === 'progress')?.title ?? 'Conflicts';
        }
        if (status === 'done') {
          return columnConfigByRole.admin.find((c) => c.id === 'done' && c.title === 'Issues')?.title ?? 'Issues';
        }
        return card.statusLabel;
      };
      // Lab needs attention (mirror lab view with current filters)
      const labMap = new Map<string, KanbanCard>();
      withComments(cards).forEach((sample) => {
        const delInfo = deletedByCard[sample.sampleId];
        if (delInfo) {
          deletedCards.push({
            ...sample,
            analysisType: 'Sample',
            status: 'new',
            statusLabel: columnConfigByRole.admin.find((c) => c.id === 'new')?.title ?? 'Deleted',
            analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
            methods: [],
            comments: commentsByCard[sample.sampleId] ?? [],
            allMethodsDone: false,
            deletedReason: delInfo.reason,
          });
          return;
        }
        if (sample.status === 'done') {
          adminCards.push({
            ...sample,
            analysisType: 'Sample',
            status: 'done',
            statusLabel: getAdminStatusLabel(sample, 'done'),
            analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
            methods: [],
            comments: commentsByCard[sample.sampleId] ?? [],
            allMethodsDone: false,
          });
          return;
        }
        const initialStatus = sample.status;
        labMap.set(sample.sampleId, {
          ...sample,
          analysisType: 'Sample',
          status: initialStatus,
          statusLabel: columnConfigByRole.lab_operator.find((c) => c.id === initialStatus)?.title ?? 'Planned',
          analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
          methods: [],
          comments: commentsByCard[sample.sampleId] ?? [],
          allMethodsDone: false,
        });
      });
      plannedAnalyses.forEach((pa) => {
        if (METHOD_BLACKLIST.includes(pa.analysisType)) return;
        const card = labMap.get(pa.sampleId);
        if (!card) return;
        const nextMethods = mergeMethods([
          ...(card.methods ?? []),
          { id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo },
        ]);
        card.methods = nextMethods;
        const { aggStatus, allDone } = aggregateStatus(nextMethods, card.status);
        card.status = aggStatus;
        card.statusLabel = columnConfigByRole.lab_operator.find((c) => c.id === aggStatus)?.title ?? card.statusLabel;
        card.allMethodsDone = allDone;
      });
      let labCards = [...labMap.values()].filter((c) => c.methods && c.methods.length > 0);
      if (assignedOnly) {
        if (!userName) {
          labCards = [];
        } else {
          labCards = labCards.filter((c) => hasUserAssignment(c));
        }
      }
      if (incompleteOnly) {
        labCards = labCards.filter((c) => hasIncomplete(c));
      }
      labCards =
        methodFilter.length === 0
          ? labCards
          : labCards.filter((c) => c.methods?.some((m) => methodFilter.includes(m.name)));
      const labColumns = getColumnData(filterCards(labCards), 'lab_operator');
      const labNeeds = labColumns.find((col) => col.id === 'review')?.cards ?? [];
      labNeeds
        .filter((c) => c.status !== 'done')
        .forEach((c) =>
          adminCards.push({ ...c, status: 'review', statusLabel: getAdminStatusLabel(c, 'review') }),
        );
      deletedCards.forEach((c) => adminCards.push(c));

      // admin "Resolved" currently unused; leave empty

      let cols = getColumnData(filterCards(adminCards), role);
      if (incompleteOnly) {
        cols = cols.map((col) => ({
          ...col,
          cards: col.cards.filter((c) => hasIncomplete(c)),
        }));
      }
      return cols;
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
        analysisStatus: analysisStatusBySampleId.get(b.title) ?? 'planned',
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
        analysisStatus: analysisStatusBySampleId.get(`Conflict ${c.id}`) ?? 'review',
        sampleStatus: 'received',
        conflictOld: c.old_payload,
        conflictNew: c.new_payload,
        conflictResolutionNote: c.resolution_note,
      }));
      const cardsWithComments = withComments([...batchCards, ...conflictCards]);
      return getColumnData(filterCards(cardsWithComments), role);
    }
    return getColumnData(filterCards(withComments(visibleCards)), role);
  }, [cards, plannedAnalyses, actionBatches, conflicts, role, filterCards, methodFilter, assignedOnly, incompleteOnly, commentsByCard, user?.fullName, deletedByCard, labStatusOverrides]);

  const statusBadgeMode =
    role === 'lab_operator'
      ? 'analysis'
      : role === 'action_supervision' || role === 'admin'
      ? 'column'
      : 'sample';
  const statusLineMode = role === 'lab_operator' ? 'sample' : role === 'action_supervision' || role === 'admin' ? 'both' : 'analysis';
  const showConflictStatus = role === 'admin' || role === 'action_supervision';
  const conflictStatusLabel = showConflictStatus ? 'Conflict' : 'Conflict status';
  const handleCardClick = (card: KanbanCard) => {
    // ensure methods are attached for the detail panel even if this card came from a role/column that does not render them
    const methodsFromAnalyses =
      mergeMethods(
        plannedAnalyses
          .filter((pa) => pa.sampleId === card.sampleId && !METHOD_BLACKLIST.includes(pa.analysisType))
          .map((pa) => ({ id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo })),
      ) || [];
    const mergedMethods = card.methods?.length ? mergeMethods(card.methods) : methodsFromAnalyses;
    setSelectedCard({ ...card, methods: mergedMethods, comments: commentsByCard[card.sampleId] ?? [] });
    setIsPanelOpen(true);
  };
  
  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCard(null), 300);
  };

  const applySampleStatusChange = (cardId: string, columnId: KanbanCard['status']) => {
    const prevCard = cards.find((c) => c.id === cardId);
    if (prevCard) {
      setUndoStack((prev) => [
        ...prev.slice(-19),
        { kind: 'sample', sampleId: prevCard.sampleId, prev: { status: prevCard.status, statusLabel: prevCard.statusLabel } },
      ]);
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
          ensureAnalyses(updated.sampleId, plannedAnalyses, setPlannedAnalyses, analysisTypes);
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

  const handleDropToColumn = (columnId: KanbanCard['status']) => (cardId: string) => {
    if (role === 'warehouse_worker') {
      const target = cards.find((c) => c.id === cardId);
      if (target?.status === 'done') {
        toast({
          title: 'Locked in Issues',
          description: 'Samples in Issues cannot be moved by Warehouse.',
          variant: 'default',
        });
        return;
      }
      if (target?.status === 'review' && columnId !== 'done') {
        toast({
          title: 'Stored is final',
          description: 'Stored samples can only move to Issues.',
          variant: 'default',
        });
        return;
      }
    }
    if (role === 'warehouse_worker' && columnId === 'review') {
      const target = cards.find((c) => c.id === cardId);
      if (target?.status === 'new') {
        setArrivalPrompt({ open: true, card: target });
        return;
      }
      if (target && !target.storageLocation) {
        setStoragePrompt({ open: true, sampleId: target.sampleId });
        setStorageValue({ fridge: '', bin: '', place: '' });
        setStorageError('');
        return;
      }
    }

    if (role === 'warehouse_worker' && columnId === 'done') {
      const target = cards.find((c) => c.id === cardId);
      if (target) {
        setIssuePrompt({ open: true, card: target });
        setIssueReason('');
        return;
      }
    }

    // Admin: prevent moving stored samples back to Needs attention/Conflicts equivalents
    if (role === 'admin') {
      const target = cards.find((c) => c.id === cardId || c.sampleId === cardId);
      if (target && target.analysisType === 'Sample' && target.status === 'done' && (columnId === 'review' || columnId === 'progress')) {
        toast({
          title: 'Cannot move stored item',
          description: 'Stored samples stay stored; they cannot be moved to Needs attention or Conflicts.',
          variant: 'default',
        });
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

    // Lab operator: allow board-only moves without touching warehouse status
    if (role === 'lab_operator') {
      setLabStatusOverrides((prev) => ({ ...prev, [cardId]: columnId }));
      if (selectedCard?.id === cardId) {
        setSelectedCard({
          ...selectedCard,
          status: columnId,
          statusLabel: columns.find((c) => c.id === columnId)?.title ?? selectedCard.statusLabel,
        });
      }
      return;
    }

    applySampleStatusChange(cardId, columnId);
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

  const undoLast = async () => {
    let lastAction: (typeof undoStack)[number] | undefined;
    setUndoStack((prev) => {
      const next = [...prev];
      lastAction = next.pop();
      return next;
    });
    if (!lastAction) return;

    if (lastAction.kind === 'sample') {
      const payload: Record<string, string | undefined> = {};
      if (lastAction.prev.status) payload.status = lastAction.prev.status;
      if (lastAction.prev.storageLocation !== undefined) payload.storage_location = lastAction.prev.storageLocation;
      if (lastAction.prev.samplingDate) payload.sampling_date = lastAction.prev.samplingDate;
      if (lastAction.prev.wellId) payload.well_id = lastAction.prev.wellId;
      if (lastAction.prev.horizon) payload.horizon = lastAction.prev.horizon;
      if (lastAction.prev.assignedTo) payload.assigned_to = lastAction.prev.assignedTo;
      try {
        await updateSampleFields(lastAction.sampleId, payload);
        setCards((prev) =>
          prev.map((card) =>
            card.sampleId === lastAction!.sampleId
              ? {
                  ...card,
                  ...mapSampleUpdates(card, payload),
                  status: (payload.status as KanbanCard['status']) ?? card.status,
                  statusLabel:
                    payload.status && columnConfigByRole[role]?.find((c) => c.id === (payload.status as KanbanCard['status']))?.title
                      ? columnConfigByRole[role]?.find((c) => c.id === (payload.status as KanbanCard['status']))?.title!
                      : card.statusLabel,
                }
              : card,
          ),
        );
        toast({ title: 'Undo', description: 'Last change reverted' });
      } catch (err) {
        toast({
          title: 'Undo failed',
          description: err instanceof Error ? err.message : 'Could not revert sample change',
          variant: 'destructive',
        });
      }
    } else if (lastAction.kind === 'analysis') {
      try {
        await updatePlannedAnalysis(lastAction.analysisId, lastAction.prevStatus, lastAction.prevAssignedTo ?? undefined);
        setPlannedAnalyses((prev) =>
          prev.map((pa) =>
            pa.id === lastAction!.analysisId ? { ...pa, status: lastAction!.prevStatus, assignedTo: lastAction!.prevAssignedTo ?? pa.assignedTo } : pa,
          ),
        );
        toast({ title: 'Undo', description: 'Last method change reverted' });
      } catch (err) {
        toast({
          title: 'Undo failed',
          description: err instanceof Error ? err.message : 'Could not revert method change',
          variant: 'destructive',
        });
      }
    }
  };

  const confirmStorage = () => {
    if (!storagePrompt.sampleId) return;
    if (!storageValue.fridge.trim() || !storageValue.bin.trim() || !storageValue.place.trim()) {
      setStorageError('Fill Fridge, Bin, and Place');
      return;
    }
    const formatted = formatStorageLocation(storageValue);
    if (!isValidStorageLocation(formatted)) {
      setStorageError('Use: Fridge {A1} · Bin {B2} · Place {C3}');
      return;
    }
    handleSampleFieldUpdate(storagePrompt.sampleId, { storage_location: formatted, status: 'review' });
    setStoragePrompt({ open: false, sampleId: null });
    setStorageValue({ fridge: '', bin: '', place: '' });
    setStorageError('');
  };

  const confirmIssueReason = () => {
    if (!issuePrompt.card || !issueReason.trim()) return;
    const targetId = issuePrompt.card.id;
    setCards((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              status: 'done',
              statusLabel: columnConfigByRole[role]?.find((col) => col.id === 'done')?.title ?? c.statusLabel,
              issueReason: issueReason.trim(),
            }
          : c,
      ),
    );
    if (selectedCard?.id === targetId) {
      setSelectedCard({ ...selectedCard, status: 'done', statusLabel: columnConfigByRole[role]?.find((col) => col.id === 'done')?.title ?? selectedCard.statusLabel, issueReason: issueReason.trim() });
    }
    setIssuePrompt({ open: false, card: null });
    setIssueReason('');
  };

  const handleAddComment = (sampleId: string, author: string, text: string) => {
    const newComment: CommentThread = {
      id: `${Date.now()}`,
      author,
      text,
      createdAt: new Date().toISOString(),
    };
    setCommentsByCard((prev) => {
      const existing = prev[sampleId] ?? [];
      const nextMap = { ...prev, [sampleId]: [...existing, newComment] };
      if (selectedCard?.sampleId === sampleId) {
        setSelectedCard({ ...selectedCard, comments: nextMap[sampleId] });
      }
      setCards((prev) =>
        prev.map((c) =>
          c.sampleId === sampleId ? { ...c, comments: nextMap[sampleId] } : c,
        ),
      );
      return nextMap;
    });
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

  const handleDeleteCard = (card: KanbanCard, reason: string) => {
    if (user?.role !== 'admin') return;
    if (card.analysisType !== 'Sample') return;
    if (!reason.trim()) return;
    const deletedLabel = columnConfigByRole.admin.find((c) => c.id === 'new')?.title ?? 'Deleted';
    setDeletedByCard((prev) => ({ ...prev, [card.sampleId]: { reason, prevStatus: card.status } }));
    setCards((prev) =>
      prev.map((c) =>
        c.sampleId === card.sampleId
          ? { ...c, status: 'new', statusLabel: deletedLabel, deletedReason: reason }
          : c,
      ),
    );
    if (selectedCard?.sampleId === card.sampleId) {
      setSelectedCard({ ...selectedCard, status: 'new', statusLabel: deletedLabel, deletedReason: reason });
    }
  };

  const handleRestoreCard = (card: KanbanCard) => {
    if (user?.role !== 'admin') return;
    const info = deletedByCard[card.sampleId];
    const prevStatus = info?.prevStatus ?? 'progress';
    const restoredLabel =
      columnConfigByRole.admin.find((c) => c.id === prevStatus)?.title ??
      columnConfigByRole.lab_operator.find((c) => c.id === prevStatus)?.title ??
      card.statusLabel;
    setDeletedByCard((prev) => {
      const { [card.sampleId]: _, ...rest } = prev;
      return rest;
    });
    setCards((prev) =>
      prev.map((c) =>
        c.sampleId === card.sampleId
          ? { ...c, status: prevStatus, statusLabel: restoredLabel, deletedReason: undefined }
          : c,
      ),
    );
    if (selectedCard?.sampleId === card.sampleId) {
      setSelectedCard({ ...selectedCard, status: prevStatus, statusLabel: restoredLabel, deletedReason: undefined });
    }
  };

  const handlePlanAnalysis = (sampleId: string) => async (data: { analysisType: string; assignedTo?: string }) => {
    try {
      const name = data.analysisType.trim();
      if (!name) {
        toast({ title: "Analysis name required", description: "Enter an analysis type", variant: "destructive" });
        return;
      }
      const known = analysisTypes.map((t) => t.toLowerCase());
      if (!isAdminUser && !known.includes(name.toLowerCase())) {
        toast({
          title: "Invalid analysis type",
          description: "Only SARA, IR, Mass Spectrometry, or Viscosity are allowed.",
          variant: "destructive",
        });
        return;
      }

      // If method already exists for this sample, do not create a duplicate. Allow assigning operator if provided.
      const existing = plannedAnalyses.find(
        (pa) => pa.sampleId === sampleId && pa.analysisType.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        const assignee = data.assignedTo && data.assignedTo !== '__unassigned' ? data.assignedTo : undefined;
        if (!assignee) {
          toast({ title: "Method already exists", description: "Select a lab operator to assign if needed.", variant: "default" });
          return;
        }
        await updatePlannedAnalysis(existing.id, existing.status, assignee);
        setPlannedAnalyses((prev) =>
          prev.map((pa) => (pa.id === existing.id ? { ...pa, assignedTo: assignee } : pa)),
        );
        toast({ title: "Operator assigned", description: `${name} assigned to ${assignee}` });
        return;
      }

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

  const handleQuickConflict = async () => {
    const ts = new Date().toISOString();
    try {
      const created = await createConflict({
        oldPayload: `action=legacy,ts=${ts}`,
        newPayload: `action=updated,ts=${ts}`,
      });
      setConflicts((prev) => [...prev, created]);
      toast({ title: "Conflict created", description: `Conflict ${created.id} added` });
    } catch (err) {
      toast({
        title: "Failed to create conflict",
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
    const prevPa = plannedAnalyses.find((pa) => pa.id === methodId);
    if (prevPa) {
      setUndoStack((prev) => [...prev.slice(-19), { kind: 'analysis', analysisId: methodId, sampleId: prevPa.sampleId, prevStatus: prevPa.status, prevAssignedTo: prevPa.assignedTo }]);
    }
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
    const nextUpdates = { ...updates };
    if (typeof nextUpdates.well_id === 'string') {
      nextUpdates.well_id = nextUpdates.well_id.replace(/\D/g, '');
      if (!nextUpdates.well_id) {
        delete nextUpdates.well_id;
      }
    }
    if (typeof nextUpdates.storage_location === 'string' && nextUpdates.storage_location.trim().length > 0) {
      if (!isValidStorageLocation(nextUpdates.storage_location)) {
        toast({
          title: 'Invalid storage location',
          description: 'Use: Fridge {A1} · Bin {B2} · Place {C3}',
          variant: 'destructive',
        });
        return;
      }
    }
    const prevCard = cards.find((c) => c.sampleId === sampleId);
    const shouldStore =
      role === 'warehouse_worker' && nextUpdates.storage_location && nextUpdates.storage_location.trim().length > 0;
    const targetStatus = shouldStore ? 'review' : undefined;
    const statusLabel =
      targetStatus && columnConfigByRole[role]?.find((c) => c.id === targetStatus)?.title;

    if (prevCard) {
      setUndoStack((prev) => [
        ...prev.slice(-19),
        {
          kind: 'sample',
          sampleId,
          prev: {
            status: prevCard.status,
            storageLocation: prevCard.storageLocation,
            samplingDate: prevCard.samplingDate,
            wellId: prevCard.wellId,
            horizon: prevCard.horizon,
            assignedTo: prevCard.assignedTo,
          },
        },
      ]);
    }

    setCards((prev) =>
      prev.map((card) =>
        card.sampleId === sampleId
          ? {
              ...card,
              ...mapSampleUpdates(card, nextUpdates),
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
              ...mapSampleUpdates(prev, nextUpdates),
              ...(targetStatus
                ? { status: targetStatus, statusLabel: statusLabel ?? prev.statusLabel }
                : {}),
            }
          : prev,
      );
    }
    try {
      await updateSampleFields(sampleId, targetStatus ? { ...nextUpdates, status: targetStatus } : nextUpdates);
      if (role === 'warehouse_worker' && (targetStatus === 'review' || nextUpdates.status === 'review')) {
        ensureAnalyses(sampleId, plannedAnalyses, setPlannedAnalyses, analysisTypes);
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
          {role === 'lab_operator' && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={incompleteOnly}
                onCheckedChange={(val) => setIncompleteOnly(Boolean(val))}
              />
              <span>Show only incomplete</span>
            </label>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            View
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={undoLast} disabled={undoStack.length === 0}>
            <Undo2 className="w-4 h-4" />
            Undo
          </Button>
          {(role === 'action_supervision' || role === 'admin') && (
            <Button variant="default" size="sm" className="gap-2" onClick={handleQuickConflict}>
              Add conflict
            </Button>
          )}
          {role === 'warehouse_worker' && (
            <NewCardDialog onCreate={handleCreateCard} open={newDialogOpen} onOpenChange={setNewDialogOpen} />
          )}
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
              <div key={`${column.id}-${column.title}`} className="w-72 flex-shrink-0">
          <KanbanColumn
            column={column}
            onCardClick={handleCardClick}
            onDropCard={handleDropToColumn(column.id)}
            showAdd={role === 'warehouse_worker' && column.id === 'new'}
            onAdd={() => setNewDialogOpen(true)}
            onToggleMethod={role === 'lab_operator' || role === 'admin' ? toggleMethodStatus : undefined}
            lockNeedsAttention={lockNeedsAttentionCards}
            showStatusActions={role === 'admin'}
            statusBadgeMode={statusBadgeMode}
            statusLineMode={statusLineMode}
            showConflictStatus={showConflictStatus}
            conflictStatusLabel={conflictStatusLabel}
            adminActions={
              isAdminUser
                ? {
                    onDelete: (card) => {
                      setDeletePrompt({ open: true, card });
                      setDeleteReason('');
                    },
                    onRestore: handleRestoreCard,
                    isDeleted: (card) => Boolean(deletedByCard[card.sampleId]),
                    ...(role === 'admin'
                      ? {
                          onResolve: (card: KanbanCard) => handleSampleFieldUpdate(card.sampleId, { status: 'done' }),
                          onReturn: (card: KanbanCard) => handleSampleFieldUpdate(card.sampleId, { status: 'progress' }),
                        }
                      : {}),
                  }
                : undefined
            }
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
        role={role}
        onPlanAnalysis={isAdminUser && selectedCard ? handlePlanAnalysis(selectedCard.sampleId) : undefined}
        onAssignOperator={
          selectedCard ? (method, operator) => {
            const target = plannedAnalyses.find(
              (pa) => pa.sampleId === selectedCard.sampleId && pa.analysisType.toLowerCase() === method.toLowerCase(),
            );
            if (!target) {
              toast({ title: "Method not found", description: "This method is not available on the card.", variant: "destructive" });
              return;
            }
            updatePlannedAnalysis(target.id, target.status, operator).then(() => {
              setPlannedAnalyses((prev) =>
                prev.map((pa) => (pa.id === target.id ? { ...pa, assignedTo: operator } : pa)),
              );
              toast({ title: "Operator assigned", description: `${method} → ${operator}` });
            }).catch((err) => {
              toast({ title: "Failed to assign", description: err instanceof Error ? err.message : "Backend unreachable", variant: "destructive" });
            });
          } : undefined
        }
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
        adminActions={
          role === 'admin' && selectedCard?.status === 'review'
            ? {
          onResolve: () => handleSampleFieldUpdate(selectedCard.sampleId, { status: 'done' }),
          onReturn: () => handleSampleFieldUpdate(selectedCard.sampleId, { status: 'progress' }),
        }
      : undefined
    }
        availableMethods={DEFAULT_ANALYSIS_TYPES}
        operatorOptions={labOperators}
        comments={selectedCard?.comments ?? []}
        onAddComment={handleAddComment}
        currentUserName={user?.fullName || user?.username}
      />
      <Dialog
        open={storagePrompt.open}
        onOpenChange={(open) => {
          setStoragePrompt({ open, sampleId: open ? storagePrompt.sampleId : null });
          if (!open) {
            setStorageValue({ fridge: '', bin: '', place: '' });
            setStorageError('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Storage location</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Storage location is required to store this sample.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Input
                autoFocus
                placeholder="A1"
                value={storageValue.fridge}
                onChange={(e) => {
                  setStorageValue((prev) => ({ ...prev, fridge: e.target.value }));
                  setStorageError('');
                }}
              />
              <p className="text-xs text-muted-foreground">Fridge</p>
            </div>
            <div className="space-y-1">
              <Input
                placeholder="B2"
                value={storageValue.bin}
                onChange={(e) => {
                  setStorageValue((prev) => ({ ...prev, bin: e.target.value }));
                  setStorageError('');
                }}
              />
              <p className="text-xs text-muted-foreground">Bin</p>
            </div>
            <div className="space-y-1">
              <Input
                placeholder="C3"
                value={storageValue.place}
                onChange={(e) => {
                  setStorageValue((prev) => ({ ...prev, place: e.target.value }));
                  setStorageError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmStorage();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Place</p>
            </div>
          </div>
          {storageError && <p className="text-sm text-destructive">{storageError}</p>}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setStoragePrompt({ open: false, sampleId: null })}>
              Cancel
            </Button>
            <Button
              onClick={confirmStorage}
              disabled={!storageValue.fridge.trim() || !storageValue.bin.trim() || !storageValue.place.trim()}
            >
              Save & Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={arrivalPrompt.open} onOpenChange={(open) => setArrivalPrompt({ open, card: open ? arrivalPrompt.card : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Did the sample arrive?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Confirm arrival before moving the sample to Stored.</p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setArrivalPrompt({ open: false, card: null })}>
              No
            </Button>
            <Button
              onClick={() => {
                const target = arrivalPrompt.card;
                setArrivalPrompt({ open: false, card: null });
                if (!target) return;
                if (target.storageLocation && target.storageLocation.trim()) {
                  applySampleStatusChange(target.sampleId, 'review');
                  return;
                }
                setStorageValue({ fridge: '', bin: '', place: '' });
                setStorageError('');
                setStoragePrompt({ open: true, sampleId: target.sampleId });
              }}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deletePrompt.open} onOpenChange={(open) => setDeletePrompt({ open, card: open ? deletePrompt.card : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete card</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Please provide a reason for deleting this card. It will move to the Admin “Deleted” column and can be restored later.
          </p>
          <Textarea
            autoFocus
            placeholder="Reason for deletion"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            className="min-h-[96px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeletePrompt({ open: false, card: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletePrompt.card && deleteReason.trim()) {
                  handleDeleteCard(deletePrompt.card, deleteReason.trim());
                  setDeletePrompt({ open: false, card: null });
                  setDeleteReason('');
                }
              }}
              disabled={!deleteReason.trim()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={issuePrompt.open} onOpenChange={(open) => setIssuePrompt({ open, card: open ? issuePrompt.card : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to Issues</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Provide a reason for sending this sample to Issues.</p>
          <Textarea
            autoFocus
            placeholder="Reason for issue"
            value={issueReason}
            onChange={(e) => setIssueReason(e.target.value)}
            className="min-h-[96px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIssuePrompt({ open: false, card: null })}>
              Cancel
            </Button>
            <Button onClick={confirmIssueReason} disabled={!issueReason.trim()}>
              Move to Issues
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  analysisTypes: string[],
) {
  const existingTypes = new Set(existing.filter((pa) => pa.sampleId === sampleId).map((pa) => pa.analysisType));
  const missing = analysisTypes.filter((t) => !existingTypes.has(t));
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
  const baseAllDone = methods.every((m) => m.status === 'completed');
  // Preserve explicit review/done moves
  if (fallback === 'review') return { aggStatus: 'review', allDone: baseAllDone };
  if (fallback === 'done' && baseAllDone) return { aggStatus: 'done', allDone: baseAllDone };
  const hasReview = methods.some((m) => m.status === 'review' || m.status === 'failed');
  const allDone = baseAllDone;
  const hasProgress = methods.some((m) => m.status === 'in_progress');
  if (hasReview) return { aggStatus: 'review', allDone };
  if (allDone) {
    // If user placed card in review, keep it there; otherwise keep in progress with highlight
    return { aggStatus: fallback === 'review' ? 'review' : 'progress', allDone };
  }
  if (hasProgress) return { aggStatus: 'progress', allDone };
  return { aggStatus: fallback ?? 'new', allDone };
}

function mergeMethods(methods: { id: number; name: string; status: PlannedAnalysisCard['status']; assignedTo?: string | null }[]) {
  const priority: Record<PlannedAnalysisCard['status'], number> = {
    completed: 4,
    review: 3,
    in_progress: 2,
    planned: 1,
    failed: 0,
  };
  const map = new Map<
    string,
    { id: number; name: string; status: PlannedAnalysisCard['status']; assignedTo?: string | null }
  >();
  methods.forEach((m) => {
    const key = m.name.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing || priority[m.status] > priority[existing.status]) {
      map.set(key, m);
    }
  });
  return Array.from(map.values());
}

function dedupeAnalyses(list: PlannedAnalysisCard[]) {
  const merged = mergeMethods(list.map((pa) => ({ id: pa.id, name: pa.analysisType, status: pa.status, assignedTo: pa.assignedTo })));
  return merged.map((m) => {
    const source = list.find((pa) => pa.analysisType.toLowerCase() === m.name.toLowerCase());
    return {
      id: m.id,
      sampleId: source?.sampleId ?? '',
      analysisType: m.name,
      status: m.status,
      assignedTo: m.assignedTo,
    } as PlannedAnalysisCard;
  });
}
