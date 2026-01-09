import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const LAB_OVERRIDES_KEY = 'labsync-lab-overrides';
const LAB_RETURN_KEY = 'labsync-lab-returned';
const WAREHOUSE_RETURN_KEY = 'labsync-warehouse-returned';
const ADMIN_RETURN_KEY = 'labsync-admin-return-notes';
const ISSUE_REASON_KEY = 'labsync-issue-reasons';
const ADMIN_STORED_KEY = 'labsync-admin-stored';
const ADMIN_STORED_SOURCE_KEY = 'labsync-admin-stored-source';
const SHOW_LAB_COMPLETED_MOCK = true;

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
      | { kind: 'sample'; sampleId: string; prev: Partial<KanbanCard>; prevWarehouseReturnHighlight?: boolean }
      | { kind: 'analysis'; analysisId: number; sampleId: string; prevStatus: PlannedAnalysisCard['status']; prevAssignedTo?: string | null; prevLabOverride?: KanbanCard['status']; prevLabReturnHighlight?: boolean }
      | { kind: 'adminStored'; sampleId: string; prev: boolean }
      | { kind: 'labState'; sampleId: string; prev: { labStatusOverride?: KanbanCard['status']; labReturnHighlight?: boolean; labNeedsReason?: string; issueHistory?: string[] } }
      | { kind: 'deleted'; sampleId: string; prevDeleted?: DeletedInfo; prevCard?: Partial<KanbanCard> }
      | { kind: 'adminReturn'; sampleId: string; prevReturnNotes?: string[]; prevLabOverride?: KanbanCard['status']; prevLabReturnHighlight?: boolean; prevWarehouseReturnHighlight?: boolean; prevSample?: Partial<KanbanCard> }
      | { kind: 'issueReason'; sampleId: string; prevStatus?: KanbanCard['status']; prevStatusLabel?: string; prevIssueHistory?: string[]; prevIssueReason?: string }
      | { kind: 'conflict'; conflictId: number; prevStatus: string; prevResolutionNote?: string | null }
    )[]
  >([]);
  const undoStackRef = useRef<(typeof undoStack)[number][]>([]);
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
  const [labStatusOverrides, setLabStatusOverrides] = useState<Record<string, KanbanCard['status']>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(LAB_OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [labReturnHighlights, setLabReturnHighlights] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(LAB_RETURN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [warehouseReturnHighlights, setWarehouseReturnHighlights] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(WAREHOUSE_RETURN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [adminReturnNotes, setAdminReturnNotes] = useState<Record<string, string[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(ADMIN_RETURN_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const normalized: Record<string, string[]> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          normalized[key] = value.filter(Boolean) as string[];
        } else if (typeof value === 'string' && value.trim()) {
          normalized[key] = [value.trim()];
        }
      });
      return normalized;
    } catch {
      return {};
    }
  });
  const [issueReasons, setIssueReasons] = useState<Record<string, string[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(ISSUE_REASON_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const normalized: Record<string, string[]> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          normalized[key] = value.filter(Boolean) as string[];
        } else if (typeof value === 'string' && value.trim()) {
          normalized[key] = [value.trim()];
        }
      });
      return normalized;
    } catch {
      return {};
    }
  });
  const [adminStoredByCard, setAdminStoredByCard] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(ADMIN_STORED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [adminStoredSources, setAdminStoredSources] = useState<Record<string, 'issues' | 'needs_attention'>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(ADMIN_STORED_SOURCE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [labNeedsAttentionReasons, setLabNeedsAttentionReasons] = useState<Record<string, string>>({});
  const [labNeedsPrompt, setLabNeedsPrompt] = useState<{ open: boolean; cardId: string | null }>({ open: false, cardId: null });
  const [labNeedsReason, setLabNeedsReason] = useState('');
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
      if (role === 'lab_operator' && selectedCard.analysisType === 'Sample') {
        merged.status = selectedCard.status;
        merged.statusLabel = selectedCard.statusLabel;
        merged.analysisStatus = selectedCard.analysisStatus;
      }
      if (merged.methods) {
        const { allDone } = aggregateStatus(merged.methods, merged.status);
        merged.allMethodsDone = allDone;
      }
      setSelectedCard(merged);
    }
  }, [cards, plannedAnalyses, role, selectedCard]);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

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
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LAB_OVERRIDES_KEY, JSON.stringify(labStatusOverrides));
  }, [labStatusOverrides]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LAB_RETURN_KEY, JSON.stringify(labReturnHighlights));
  }, [labReturnHighlights]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WAREHOUSE_RETURN_KEY, JSON.stringify(warehouseReturnHighlights));
  }, [warehouseReturnHighlights]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ADMIN_RETURN_KEY, JSON.stringify(adminReturnNotes));
  }, [adminReturnNotes]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ISSUE_REASON_KEY, JSON.stringify(issueReasons));
  }, [issueReasons]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ADMIN_STORED_KEY, JSON.stringify(adminStoredByCard));
  }, [adminStoredByCard]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ADMIN_STORED_SOURCE_KEY, JSON.stringify(adminStoredSources));
  }, [adminStoredSources]);
  useEffect(() => {
    if (role === 'warehouse_worker' || role === 'action_supervision') {
      setMethodFilter([]);
    }
  }, [role]);

  const setLabReturnState = (sampleId: string, status: KanbanCard['status']) => {
    setLabStatusOverrides((prev) => ({ ...prev, [sampleId]: status }));
    setLabReturnHighlights((prev) => ({ ...prev, [sampleId]: true }));
  };
  const [adminReturnPrompt, setAdminReturnPrompt] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });
  const [adminReturnNote, setAdminReturnNote] = useState('');
  const getLatestReturnNote = (sampleId: string) => {
    const notes = adminReturnNotes[sampleId] ?? [];
    return notes.length > 0 ? notes[notes.length - 1] : '';
  };

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
    const visibleCards =
      role === 'admin'
        ? cards
        : cards.filter((c) => !deletedByCard[c.sampleId] && !adminStoredByCard[c.sampleId]);
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
    const sampleIds = new Set<string>(cards.map((c) => c.sampleId));
    analysesBySampleId.forEach((_, sampleId) => sampleIds.add(sampleId));
    sampleIds.forEach((sampleId) => {
      const methods =
        mergeMethods(
          (analysesBySampleId.get(sampleId) ?? []).map((pa) => ({
            id: pa.id,
            name: pa.analysisType,
            status: pa.status,
            assignedTo: pa.assignedTo,
          })),
        ) ?? [];
      const overrideStatus = labStatusOverrides[sampleId];
      if (methods.length === 0) {
        const labStatus = overrideStatus ?? 'new';
        analysisStatusBySampleId.set(sampleId, toAnalysisStatus(labStatus));
        return;
      }
      const { aggStatus } = aggregateStatus(methods, 'new');
      const labStatus = overrideStatus ?? aggStatus;
      analysisStatusBySampleId.set(sampleId, toAnalysisStatus(labStatus));
    });

    if (role === 'lab_operator') {
      const bySample = new Map<string, KanbanCard>();
      withComments(visibleCards).forEach((sample) => {
        const hasOverride = Boolean(labStatusOverrides[sample.sampleId]) || Boolean(labReturnHighlights[sample.sampleId]);
        if (sample.status !== 'review' && !hasOverride) {
          return;
        }
        const initialStatus = 'new';
        if (role !== 'admin' && deletedByCard[sample.sampleId]) {
          return;
        }
        const issueHistory = issueReasons[sample.sampleId] ?? [];
        const returnNotes = adminReturnNotes[sample.sampleId] ?? [];
        bySample.set(sample.sampleId, {
          ...sample,
          returnNote: returnNotes[returnNotes.length - 1],
          issueReason: issueHistory[issueHistory.length - 1],
          issueHistory,
          returnNotes,
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
        if (card.status === 'review') {
          const issueHistory = issueReasons[card.sampleId] ?? [];
          const fallback = labNeedsAttentionReasons[card.sampleId];
          const latest = issueHistory[issueHistory.length - 1] ?? fallback;
          if (latest) {
            card.issueReason = latest;
            card.issueHistory = issueHistory.length > 0 ? issueHistory : [latest];
          }
        }
        card.returnedFromAdmin = Boolean(labReturnHighlights[card.sampleId]);
        if (adminReturnNotes[card.sampleId]?.length) {
          const notes = adminReturnNotes[card.sampleId];
          card.returnNote = notes[notes.length - 1];
          card.returnNotes = notes;
        }
        card.statusLabel =
          columnConfigByRole.lab_operator.find((c) => c.id === card.status)?.title ?? card.statusLabel;
        card.analysisStatus = toAnalysisStatus(card.status);
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
      if (SHOW_LAB_COMPLETED_MOCK && !assignedOnly && !incompleteOnly && methodFilter.length === 0) {
        const exists = cardsWithMethods.some((c) => c.sampleId === 'MOCK-COMPLETED');
        if (!exists) {
          cardsWithMethods = [
            ...cardsWithMethods,
            {
              id: 'mock-completed',
              status: 'done',
              statusLabel: columnConfigByRole.lab_operator.find((c) => c.id === 'done')?.title ?? 'Completed',
              sampleId: 'MOCK-COMPLETED',
              wellId: '000',
              horizon: '—',
              samplingDate: '2026-01-01',
              storageLocation: '—',
              analysisType: 'Sample',
              assignedTo: 'Mock',
              analysisStatus: 'completed',
              sampleStatus: 'received',
              methods: [{ id: -1, name: 'SARA', status: 'completed', assignedTo: 'Mock' }],
              allMethodsDone: true,
            },
          ];
        }
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
        const issueHistory = issueReasons[sample.sampleId] ?? [];
        const adminIssueReason =
          issueHistory[issueHistory.length - 1] ??
          sample.issueReason ??
          labNeedsAttentionReasons[sample.sampleId];
        const delInfo = deletedByCard[sample.sampleId];
        if (delInfo) {
          deletedCards.push({
            ...sample,
            returnNote: adminReturnNotes[sample.sampleId]?.slice(-1)[0],
            returnNotes: adminReturnNotes[sample.sampleId],
            issueReason: adminIssueReason,
            issueHistory,
            analysisType: 'Sample',
            status: 'new',
            statusLabel: columnConfigByRole.admin.find((c) => c.id === 'new')?.title ?? 'Deleted',
            analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
            adminStored: false,
            methods: [],
            comments: commentsByCard[sample.sampleId] ?? [],
            allMethodsDone: false,
            deletedReason: delInfo.reason,
          });
          return;
        }
        if (adminStoredByCard[sample.sampleId]) {
          adminCards.push({
            ...sample,
            returnNote: adminReturnNotes[sample.sampleId]?.slice(-1)[0],
            returnNotes: adminReturnNotes[sample.sampleId],
            issueReason: adminIssueReason,
            issueHistory,
            analysisType: 'Sample',
            status: 'done',
            statusLabel: columnConfigByRole.admin.find((c) => c.id === 'done' && c.title === 'Stored')?.title ?? 'Stored',
            analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
            adminStored: true,
            methods: [],
            comments: commentsByCard[sample.sampleId] ?? [],
            allMethodsDone: false,
          });
          return;
        }
        if (sample.status === 'done') {
          adminCards.push({
            ...sample,
            returnNote: adminReturnNotes[sample.sampleId]?.slice(-1)[0],
            returnNotes: adminReturnNotes[sample.sampleId],
            issueReason: adminIssueReason,
            issueHistory,
            analysisType: 'Sample',
            status: 'done',
            statusLabel: getAdminStatusLabel(sample, 'done'),
            analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
            adminStored: false,
            methods: [],
            comments: commentsByCard[sample.sampleId] ?? [],
            allMethodsDone: false,
          });
          return;
        }
        const hasOverride = Boolean(labStatusOverrides[sample.sampleId]) || Boolean(labReturnHighlights[sample.sampleId]);
        if (sample.status !== 'review' && !hasOverride) {
          return;
        }
        const initialStatus: KanbanCard['status'] = 'new';
        labMap.set(sample.sampleId, {
          ...sample,
          returnNote: adminReturnNotes[sample.sampleId]?.slice(-1)[0],
          returnNotes: adminReturnNotes[sample.sampleId],
          issueReason: adminIssueReason,
          issueHistory,
          analysisType: 'Sample',
          status: initialStatus,
          statusLabel: columnConfigByRole.lab_operator.find((c) => c.id === initialStatus)?.title ?? 'Planned',
          analysisStatus: analysisStatusBySampleId.get(sample.sampleId) ?? sample.analysisStatus,
          adminStored: false,
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
        if (adminReturnNotes[card.sampleId]) {
          card.returnNote = adminReturnNotes[card.sampleId];
        }
        const overrideStatus = labStatusOverrides[card.sampleId];
        if (overrideStatus) {
          card.status = overrideStatus;
          card.statusLabel = columnConfigByRole.lab_operator.find((c) => c.id === overrideStatus)?.title ?? card.statusLabel;
          card.analysisStatus = toAnalysisStatus(overrideStatus);
        }
        if (card.status === 'review') {
          const issueHistory = issueReasons[card.sampleId] ?? [];
          const fallback = labNeedsAttentionReasons[card.sampleId];
          const latest = issueHistory[issueHistory.length - 1] ?? fallback;
          if (latest) {
            card.issueReason = latest;
            card.issueHistory = issueHistory.length > 0 ? issueHistory : [latest];
          }
        }
        if (adminReturnNotes[card.sampleId]?.length) {
          const notes = adminReturnNotes[card.sampleId];
          card.returnNote = notes[notes.length - 1];
          card.returnNotes = notes;
        }
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
          adminCards.push({
            ...c,
            status: 'review',
            statusLabel: getAdminStatusLabel(c, 'review'),
            returnedFromAdmin: false,
          }),
        );
      deletedCards.forEach((c) => adminCards.push(c));

      // admin "Resolved" currently unused; leave empty

      let filteredAdminCards = adminCards;
      if (methodFilter.length > 0) {
        filteredAdminCards = adminCards.filter((c) => c.methods?.some((m) => methodFilter.includes(m.name)));
      }
      let cols = getColumnData(filterCards(filteredAdminCards), role);
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
    if (role === 'warehouse_worker') {
      const decorated = withComments(visibleCards).map((card) => {
        const issueHistory = issueReasons[card.sampleId] ?? [];
        const analysisStatus = analysisStatusBySampleId.get(card.sampleId) ?? card.analysisStatus;
        const analysisLabel =
          analysisStatus === 'completed'
            ? 'Completed'
            : analysisStatus === 'review'
            ? 'Needs attention'
            : analysisStatus === 'in_progress'
            ? 'In progress'
            : 'Planned';
        return {
          ...card,
          returnedToWarehouse: Boolean(warehouseReturnHighlights[card.sampleId]),
          issueReason: issueHistory[issueHistory.length - 1] ?? card.issueReason,
          issueHistory,
          analysisStatus,
          analysisLabel,
        };
      });
      return getColumnData(filterCards(decorated), role);
    }
    return getColumnData(filterCards(withComments(visibleCards)), role);
  }, [cards, plannedAnalyses, actionBatches, conflicts, role, filterCards, methodFilter, assignedOnly, incompleteOnly, commentsByCard, user?.fullName, deletedByCard, adminStoredByCard, labStatusOverrides, labNeedsAttentionReasons, labReturnHighlights, warehouseReturnHighlights, adminReturnNotes, issueReasons]);

  const statusBadgeMode =
    role === 'lab_operator'
      ? 'analysis'
      : role === 'action_supervision' || role === 'admin'
      ? 'column'
      : 'sample';
  const statusLineMode = role === 'lab_operator' ? 'sample' : role === 'action_supervision' || role === 'admin' ? 'both' : 'analysis';
  const analysisLabelMode = role === 'lab_operator' || role === 'warehouse_worker' ? 'column' : 'analysis';
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
    let issueHistory = issueReasons[card.sampleId] ?? [];
    const fallbackLabReason = labNeedsAttentionReasons[card.sampleId];
    if (issueHistory.length === 0 && fallbackLabReason) {
      issueHistory = [fallbackLabReason];
    }
    const issueReason =
      card.issueReason ?? issueHistory[issueHistory.length - 1] ?? fallbackLabReason;
    const returnNotes = adminReturnNotes[card.sampleId] ?? [];
    const returnNote = card.returnNote ?? returnNotes[returnNotes.length - 1];
    setSelectedCard({
      ...card,
      methods: mergedMethods,
      comments: commentsByCard[card.sampleId] ?? [],
      issueReason,
      issueHistory,
      returnNote,
      returnNotes,
    });
    setIsPanelOpen(true);
  };

  const getSampleSnapshot = (sampleId: string): Partial<KanbanCard> | undefined => {
    const card = cards.find((c) => c.sampleId === sampleId);
    if (!card) return undefined;
    return {
      status: card.status,
      statusLabel: card.statusLabel,
      storageLocation: card.storageLocation,
      samplingDate: card.samplingDate,
      wellId: card.wellId,
      horizon: card.horizon,
      assignedTo: card.assignedTo,
      deletedReason: card.deletedReason,
    };
  };

  const pushLabStateUndo = (sampleId: string) => {
    setUndoStack((prev) => [
      ...prev.slice(-19),
      {
        kind: 'labState',
        sampleId,
        prev: {
          labStatusOverride: labStatusOverrides[sampleId],
          labReturnHighlight: labReturnHighlights[sampleId],
          labNeedsReason: labNeedsAttentionReasons[sampleId],
          issueHistory: issueReasons[sampleId],
        },
      },
    ]);
  };

  const handleAdminStoreNotResolved = (card: KanbanCard) => {
    const prevValue = Boolean(adminStoredByCard[card.sampleId]);
    setUndoStack((prev) => [...prev.slice(-19), { kind: 'adminStored', sampleId: card.sampleId, prev: prevValue }]);
    setAdminStoredByCard((prev) => ({ ...prev, [card.sampleId]: true }));
    const source = card.status === 'review' ? 'needs_attention' : 'issues';
    setAdminStoredSources((prev) => ({ ...prev, [card.sampleId]: source }));
    if (selectedCard?.sampleId === card.sampleId) {
      setSelectedCard({ ...selectedCard, adminStored: true });
    }
  };
  const handleAdminStoredRestore = (card: KanbanCard) => {
    const source = adminStoredSources[card.sampleId] ?? 'issues';
    setAdminStoredByCard((prev) => {
      const { [card.sampleId]: _, ...rest } = prev;
      return rest;
    });
    setAdminStoredSources((prev) => {
      const { [card.sampleId]: _, ...rest } = prev;
      return rest;
    });
    if (source === 'needs_attention') {
      setLabStatusOverrides((prev) => ({ ...prev, [card.sampleId]: 'review' }));
    } else {
      handleSampleFieldUpdate(card.sampleId, { status: 'done' }, { skipUndo: true });
    }
  };
  
  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCard(null), 300);
  };

  const applySampleStatusChange = (cardId: string, columnId: KanbanCard['status'], options?: { skipUndo?: boolean }) => {
    const prevCard =
      cards.find((c) => c.id === cardId || c.sampleId === cardId) ??
      columns.flatMap((c) => c.cards).find((c) => c.id === cardId || c.sampleId === cardId);
    if (prevCard && !options?.skipUndo) {
      setUndoStack((prev) => [
        ...prev.slice(-19),
        {
          kind: 'sample',
          sampleId: prevCard.sampleId,
          prev: { status: prevCard.status, statusLabel: prevCard.statusLabel },
          prevWarehouseReturnHighlight: Boolean(warehouseReturnHighlights[prevCard.sampleId]),
        },
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

  const handleDropToColumn = (columnId: KanbanCard['status'], columnTitle?: string) => (cardId: string) => {
    if (role === 'warehouse_worker') {
      const target =
        cards.find((c) => c.id === cardId || c.sampleId === cardId) ??
        columns.flatMap((c) => c.cards).find((c) => c.id === cardId || c.sampleId === cardId);
      if (target?.status === 'done') {
        toast({
          title: 'Locked in Issues',
          description: 'Samples in Issues cannot be moved by Warehouse.',
          variant: 'default',
        });
        return;
      }
      if (target?.status === 'progress' && columnId === 'new') {
        toast({
          title: 'Invalid move',
          description: 'Awaiting arrival samples cannot be moved back to Planned.',
          variant: 'default',
        });
        return;
      }
      if (!target) {
        toast({
          title: 'Move failed',
          description: `Could not resolve card for drop id: ${cardId}`,
          variant: 'destructive',
        });
        return;
      }
      if (target) {
        setUndoStack((prev) => [
          ...prev.slice(-19),
          {
            kind: 'sample',
            sampleId: target.sampleId,
            prev: { status: target.status, statusLabel: target.statusLabel },
            prevWarehouseReturnHighlight: Boolean(warehouseReturnHighlights[target.sampleId]),
          },
        ]);
      }
      if (target?.status === 'review' && columnId !== 'done') {
        toast({
          title: 'Stored is final',
          description: 'Stored samples can only move to Issues.',
          variant: 'default',
        });
        return;
      }
      setWarehouseReturnHighlights((prev) => {
        const key = target?.sampleId ?? cardId;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
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
      const target =
        columns.flatMap((c) => c.cards).find((c) => c.id === cardId || c.sampleId === cardId) ??
        cards.find((c) => c.id === cardId || c.sampleId === cardId);
      if (
        target &&
        target.analysisType === 'Sample' &&
        ((target.status === 'done' && columnId === 'review' && !target.adminStored && columnTitle === 'Needs attention') ||
          (target.status === 'review' && columnId === 'done' && columnTitle === 'Issues'))
      ) {
        toast({
          title: 'Invalid move',
          description: 'Issues and Needs attention cannot be swapped directly.',
          variant: 'default',
        });
        return;
      }
      if (target && target.analysisType === 'Sample' && (target.status === 'done' || target.status === 'review') && columnId === 'done' && columnTitle === 'Stored') {
        handleAdminStoreNotResolved(target);
        return;
      }
      if (target && target.analysisType === 'Sample' && columnId === 'new' && columnTitle === 'Deleted') {
        setDeletePrompt({ open: true, card: target });
        setDeleteReason('');
        return;
      }
      if (
        target &&
        target.analysisType === 'Sample' &&
        target.status === 'done' &&
        (target.adminStored || adminStoredByCard[target.sampleId]) &&
        (columnId === 'review' || columnId === 'progress') &&
        (columnTitle === 'Needs attention' || columnTitle === 'Conflicts')
      ) {
        toast({
          title: 'Cannot move stored item',
          description: columnTitle === 'Needs attention'
            ? 'Stored samples stay stored; they cannot be moved to Needs attention.'
            : 'Stored samples stay stored; they cannot be moved to Conflicts.',
          variant: 'default',
        });
        return;
      }
      if (
        target &&
        target.analysisType === 'Sample' &&
        target.status === 'done' &&
        (target.adminStored || adminStoredByCard[target.sampleId]) &&
        columnTitle === 'Issues'
      ) {
        toast({
          title: 'Cannot move stored item',
          description: 'Stored samples stay stored; they cannot be moved to Issues.',
          variant: 'default',
        });
        return;
      }
      if (
        target &&
        target.analysisType === 'Sample' &&
        deletedByCard[target.sampleId] &&
        (columnTitle === 'Issues' || columnTitle === 'Needs attention' || columnTitle === 'Stored')
      ) {
        toast({
          title: 'Cannot move deleted item',
          description: 'Deleted samples can only be restored from the Deleted column.',
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
      if (role === 'action_supervision' && columnId === 'new') {
        toast({
          title: 'Invalid move',
          description: 'Conflict items cannot be moved to Uploaded batch.',
          variant: 'default',
        });
        return;
      }
      setUndoStack((prev) => [
        ...prev.slice(-19),
        { kind: 'conflict', conflictId: conflict.id, prevStatus: conflict.status, prevResolutionNote: conflict.resolution_note },
      ]);
      setConflicts((prev) =>
        prev.map((c) => (c.id === conflict.id ? { ...c, status: 'resolved', resolution_note: c.resolution_note } : c)),
      );
      resolveConflict(conflict.id).catch(() => {});
      return;
    }

    // Lab operator: allow board-only moves without touching warehouse status
    if (role === 'lab_operator') {
      if (columnId === 'done') {
        toast({
          title: 'Cannot move to Completed',
          description: 'Completion will be handled automatically.',
          variant: 'default',
        });
        return;
      }
      const labCard = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
      const currentStatus = labStatusOverrides[cardId] ?? labCard?.status;
      if (currentStatus === 'new' && columnId !== 'progress' && columnId !== 'review') {
        toast({
          title: 'Invalid move',
          description: 'Planned samples can move to In progress or Needs attention only.',
          variant: 'default',
        });
        return;
      }
      if (currentStatus === 'done') {
        toast({
          title: 'Locked in Completed',
          description: 'Completed samples cannot be moved by Lab Operator.',
          variant: 'default',
        });
        return;
      }
      if (currentStatus === 'review') {
        toast({
          title: 'Locked in Needs attention',
          description: 'Samples in Needs attention cannot be moved by Lab Operator.',
          variant: 'default',
        });
        return;
      }
      if (currentStatus === 'progress' && columnId !== 'progress' && columnId !== 'review') {
        toast({
          title: 'Invalid move',
          description: 'Samples stay in In progress or Needs attention until completion.',
          variant: 'default',
        });
        return;
      }
      if (columnId === 'review') {
        setLabNeedsPrompt({ open: true, cardId });
        setLabNeedsReason(labNeedsAttentionReasons[cardId] ?? '');
        return;
      }
      pushLabStateUndo(cardId);
      setLabStatusOverrides((prev) => ({ ...prev, [cardId]: columnId }));
      setLabReturnHighlights((prev) => {
        if (!prev[cardId]) return prev;
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      if (columnId !== 'review') {
        setLabNeedsAttentionReasons((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
      }
      if (selectedCard?.id === cardId) {
        setSelectedCard({
          ...selectedCard,
          status: columnId,
          statusLabel: columns.find((c) => c.id === columnId)?.title ?? selectedCard.statusLabel,
        });
      }
      return;
    }

    applySampleStatusChange(cardId, columnId, { skipUndo: role === 'warehouse_worker' });
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

  const applySampleUndo = async (sampleId: string, snapshot?: Partial<KanbanCard>) => {
    if (!snapshot) return;
    const payload: Record<string, string | undefined> = {};
    if (snapshot.status) payload.status = snapshot.status;
    if (snapshot.storageLocation !== undefined) payload.storage_location = snapshot.storageLocation;
    if (snapshot.samplingDate) payload.sampling_date = snapshot.samplingDate;
    if (snapshot.wellId) payload.well_id = snapshot.wellId;
    if (snapshot.horizon) payload.horizon = snapshot.horizon;
    if (snapshot.assignedTo) payload.assigned_to = snapshot.assignedTo;
    // Optimistic local update for undo so the board reverts immediately.
    setCards((prev) =>
      prev.map((card) =>
        card.sampleId === sampleId
          ? {
              ...card,
              ...mapSampleUpdates(card, payload),
              status: (payload.status as KanbanCard['status']) ?? card.status,
              statusLabel:
                payload.status && columnConfigByRole[role]?.find((c) => c.id === (payload.status as KanbanCard['status']))?.title
                  ? columnConfigByRole[role]?.find((c) => c.id === (payload.status as KanbanCard['status']))?.title!
                  : card.statusLabel,
              deletedReason: snapshot.deletedReason,
            }
          : card,
      ),
    );
    if (selectedCard?.sampleId === sampleId) {
      setSelectedCard((prev) =>
        prev
          ? {
              ...prev,
              ...mapSampleUpdates(prev, payload),
              status: (payload.status as KanbanCard['status']) ?? prev.status,
              statusLabel:
                payload.status && columnConfigByRole[role]?.find((c) => c.id === (payload.status as KanbanCard['status']))?.title
                  ? columnConfigByRole[role]?.find((c) => c.id === (payload.status as KanbanCard['status']))?.title!
                  : prev.statusLabel,
              deletedReason: snapshot.deletedReason,
            }
          : prev,
      );
    }
    try {
      if (payload.status) {
        await updateSampleStatus(sampleId, payload.status, payload.storage_location);
      }
      const fieldPayload: Record<string, string | undefined> = {};
      if (payload.storage_location !== undefined && !payload.status) fieldPayload.storage_location = payload.storage_location;
      if (payload.sampling_date) fieldPayload.sampling_date = payload.sampling_date;
      if (payload.well_id) fieldPayload.well_id = payload.well_id;
      if (payload.horizon) fieldPayload.horizon = payload.horizon;
      if (payload.assigned_to) fieldPayload.assigned_to = payload.assigned_to;
      if (Object.keys(fieldPayload).length > 0) {
        await updateSampleFields(sampleId, fieldPayload);
      }
    } catch (err) {
      toast({
        title: 'Undo sync failed',
        description: err instanceof Error ? err.message : 'Undo applied locally but failed to sync with the server',
        variant: 'destructive',
      });
    }
  };

  const undoLast = async () => {
    const stackSnapshot = undoStackRef.current;
    const lastAction = stackSnapshot[stackSnapshot.length - 1];
    if (!lastAction) return;
    setUndoStack(stackSnapshot.slice(0, -1));

    if (lastAction.kind === 'sample') {
      try {
        await applySampleUndo(lastAction.sampleId, lastAction.prev);
        if (lastAction.prevWarehouseReturnHighlight) {
          setWarehouseReturnHighlights((prev) => ({ ...prev, [lastAction.sampleId]: true }));
        } else {
          setWarehouseReturnHighlights((prev) => {
            if (!prev[lastAction.sampleId]) return prev;
            const next = { ...prev };
            delete next[lastAction.sampleId];
            return next;
          });
        }
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
        setPlannedAnalyses((prev) => {
          const updated = prev.map((pa) =>
            pa.id === lastAction!.analysisId ? { ...pa, status: lastAction!.prevStatus, assignedTo: lastAction!.prevAssignedTo ?? pa.assignedTo } : pa,
          );
          const methods = updated.filter((pa) => pa.sampleId === lastAction!.sampleId);
          const allDone = methods.length > 0 && methods.every((m) => m.status === 'completed');
          setCards((cardsPrev) =>
            cardsPrev.map((c) => (c.id === lastAction!.sampleId ? { ...c, allMethodsDone: allDone } : c)),
          );
          return updated;
        });
        if (lastAction.prevLabOverride) {
          setLabStatusOverrides((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prevLabOverride! }));
        } else {
          setLabStatusOverrides((prev) => {
            if (!(lastAction.sampleId in prev)) return prev;
            const next = { ...prev };
            delete next[lastAction.sampleId];
            return next;
          });
        }
        if (lastAction.prevLabReturnHighlight) {
          setLabReturnHighlights((prev) => ({ ...prev, [lastAction.sampleId]: true }));
        } else {
          setLabReturnHighlights((prev) => {
            if (!prev[lastAction.sampleId]) return prev;
            const next = { ...prev };
            delete next[lastAction.sampleId];
            return next;
          });
        }
        toast({ title: 'Undo', description: 'Last method change reverted' });
      } catch (err) {
        toast({
          title: 'Undo failed',
          description: err instanceof Error ? err.message : 'Could not revert method change',
          variant: 'destructive',
        });
      }
    } else if (lastAction.kind === 'adminStored') {
      setAdminStoredByCard((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prev }));
      if (selectedCard?.sampleId === lastAction.sampleId) {
        setSelectedCard({ ...selectedCard, adminStored: lastAction.prev });
      }
      toast({ title: 'Undo', description: 'Last admin store change reverted' });
    } else if (lastAction.kind === 'labState') {
      if (lastAction.prev.labStatusOverride) {
        setLabStatusOverrides((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prev.labStatusOverride! }));
      } else {
        setLabStatusOverrides((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prev.labReturnHighlight) {
        setLabReturnHighlights((prev) => ({ ...prev, [lastAction.sampleId]: true }));
      } else {
        setLabReturnHighlights((prev) => {
          if (!prev[lastAction.sampleId]) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prev.labNeedsReason) {
        setLabNeedsAttentionReasons((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prev.labNeedsReason! }));
      } else {
        setLabNeedsAttentionReasons((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prev.issueHistory) {
        setIssueReasons((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prev.issueHistory! }));
      } else {
        setIssueReasons((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (selectedCard?.sampleId === lastAction.sampleId) {
        const baseCard = cards.find((c) => c.sampleId === lastAction.sampleId);
        const status =
          lastAction.prev.labStatusOverride ??
          baseCard?.status ??
          selectedCard.status;
        const label =
          columnConfigByRole.lab_operator.find((c) => c.id === status)?.title ?? selectedCard.statusLabel;
        setSelectedCard({ ...selectedCard, status, statusLabel: label });
      }
      toast({ title: 'Undo', description: 'Last lab change reverted' });
    } else if (lastAction.kind === 'deleted') {
      if (lastAction.prevDeleted) {
        setDeletedByCard((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prevDeleted! }));
      } else {
        setDeletedByCard((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prevCard) {
        setCards((prev) =>
          prev.map((card) =>
            card.sampleId === lastAction.sampleId
              ? {
                  ...card,
                  ...lastAction.prevCard,
                }
              : card,
          ),
        );
        if (selectedCard?.sampleId === lastAction.sampleId) {
          setSelectedCard({ ...selectedCard, ...lastAction.prevCard });
        }
      }
      toast({ title: 'Undo', description: 'Last delete/restore reverted' });
    } else if (lastAction.kind === 'adminReturn') {
      if (lastAction.prevReturnNotes?.length) {
        setAdminReturnNotes((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prevReturnNotes! }));
      } else {
        setAdminReturnNotes((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prevLabOverride) {
        setLabStatusOverrides((prev) => ({ ...prev, [lastAction.sampleId]: lastAction.prevLabOverride! }));
      } else {
        setLabStatusOverrides((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prevLabReturnHighlight) {
        setLabReturnHighlights((prev) => ({ ...prev, [lastAction.sampleId]: true }));
      } else {
        setLabReturnHighlights((prev) => {
          if (!prev[lastAction.sampleId]) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prevWarehouseReturnHighlight) {
        setWarehouseReturnHighlights((prev) => ({ ...prev, [lastAction.sampleId]: true }));
      } else {
        setWarehouseReturnHighlights((prev) => {
          if (!prev[lastAction.sampleId]) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prevSample) {
        try {
          await applySampleUndo(lastAction.sampleId, lastAction.prevSample);
        } catch (err) {
          toast({
            title: 'Undo failed',
            description: err instanceof Error ? err.message : 'Could not revert return',
            variant: 'destructive',
          });
          return;
        }
      }
      if (selectedCard?.sampleId === lastAction.sampleId) {
        const returnNotes = lastAction.prevReturnNotes ?? [];
        const returnNote = returnNotes.length > 0 ? returnNotes[returnNotes.length - 1] : '';
        setSelectedCard({ ...selectedCard, returnNotes, returnNote });
      }
      toast({ title: 'Undo', description: 'Last return reverted' });
    } else if (lastAction.kind === 'issueReason') {
      const prevHistory = lastAction.prevIssueHistory;
      if (prevHistory?.length) {
        setIssueReasons((prev) => ({ ...prev, [lastAction.sampleId]: prevHistory }));
      } else {
        setIssueReasons((prev) => {
          if (!(lastAction.sampleId in prev)) return prev;
          const next = { ...prev };
          delete next[lastAction.sampleId];
          return next;
        });
      }
      if (lastAction.prevStatus) {
        setCards((prev) =>
          prev.map((card) =>
            card.sampleId === lastAction.sampleId
              ? {
                  ...card,
                  status: lastAction.prevStatus!,
                  statusLabel: lastAction.prevStatusLabel ?? card.statusLabel,
                  issueReason: lastAction.prevIssueReason,
                }
              : card,
          ),
        );
        if (selectedCard?.sampleId === lastAction.sampleId) {
          setSelectedCard({
            ...selectedCard,
            status: lastAction.prevStatus!,
            statusLabel: lastAction.prevStatusLabel ?? selectedCard.statusLabel,
            issueReason: lastAction.prevIssueReason,
          });
        }
      }
      toast({ title: 'Undo', description: 'Last issue change reverted' });
    } else if (lastAction.kind === 'conflict') {
      setConflicts((prev) =>
        prev.map((c) =>
          c.id === lastAction.conflictId
            ? { ...c, status: lastAction.prevStatus, resolution_note: lastAction.prevResolutionNote ?? c.resolution_note }
            : c,
        ),
      );
      toast({ title: 'Undo', description: 'Last conflict change reverted' });
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
    setUndoStack((prev) => [
      ...prev.slice(-19),
      {
        kind: 'issueReason',
        sampleId: issuePrompt.card.sampleId,
        prevStatus: issuePrompt.card.status,
        prevStatusLabel: issuePrompt.card.statusLabel,
        prevIssueHistory: issueReasons[issuePrompt.card.sampleId],
        prevIssueReason: issuePrompt.card.issueReason,
      },
    ]);
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
    setIssueReasons((prev) => ({
      ...prev,
      [issuePrompt.card.sampleId]: [...(prev[issuePrompt.card.sampleId] ?? []), issueReason.trim()],
    }));
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
        if (err instanceof Error && /\((4\d\d)\)/.test(err.message)) {
          return;
        }
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
    setUndoStack((prev) => [
      ...prev.slice(-19),
      { kind: 'deleted', sampleId: card.sampleId, prevDeleted: deletedByCard[card.sampleId], prevCard: getSampleSnapshot(card.sampleId) },
    ]);
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
    setUndoStack((prev) => [
      ...prev.slice(-19),
      { kind: 'deleted', sampleId: card.sampleId, prevDeleted: info, prevCard: getSampleSnapshot(card.sampleId) },
    ]);
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
      if (done) {
        const labCard = columns.flatMap((c) => c.cards).find((c) => c.id === sampleIdFromMethod);
        const currentStatus = labStatusOverrides[sampleIdFromMethod] ?? labCard?.status;
        if (currentStatus === 'new') {
          setLabStatusOverrides((prev) => ({ ...prev, [sampleIdFromMethod]: 'progress' }));
          setLabReturnHighlights((prev) => {
            const next = { ...prev };
            delete next[sampleIdFromMethod];
            return next;
          });
          if (selectedCard?.id === sampleIdFromMethod) {
            setSelectedCard({
              ...selectedCard,
              status: 'progress',
              statusLabel: columnConfigByRole.lab_operator.find((c) => c.id === 'progress')?.title ?? selectedCard.statusLabel,
            });
          }
        } else {
          setLabReturnHighlights((prev) => {
            if (!prev[sampleIdFromMethod]) return prev;
            const next = { ...prev };
            delete next[sampleIdFromMethod];
            return next;
          });
        }
      }
    }
    const nextStatus = done ? 'completed' : 'planned';
    const prevPa = plannedAnalyses.find((pa) => pa.id === methodId);
    if (prevPa) {
      setUndoStack((prev) => [
        ...prev.slice(-19),
        {
          kind: 'analysis',
          analysisId: methodId,
          sampleId: prevPa.sampleId,
          prevStatus: prevPa.status,
          prevAssignedTo: prevPa.assignedTo,
          prevLabOverride: labStatusOverrides[prevPa.sampleId],
          prevLabReturnHighlight: labReturnHighlights[prevPa.sampleId],
        },
      ]);
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

  const handleSampleFieldUpdate = async (sampleId: string, updates: Record<string, string>, options?: { skipUndo?: boolean }) => {
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

    if (prevCard && !options?.skipUndo) {
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
          prevWarehouseReturnHighlight: Boolean(warehouseReturnHighlights[sampleId]),
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
          {role !== 'warehouse_worker' && role !== 'action_supervision' && (
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
          )}
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
            <NewCardDialog
              onCreate={handleCreateCard}
              existingSampleIds={cards.map((card) => card.sampleId)}
              open={newDialogOpen}
              onOpenChange={setNewDialogOpen}
            />
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
            onDropCard={handleDropToColumn(column.id, column.title)}
            showAdd={role === 'warehouse_worker' && column.id === 'new'}
            onAdd={() => setNewDialogOpen(true)}
            onToggleMethod={role === 'lab_operator' || role === 'admin' ? toggleMethodStatus : undefined}
            lockNeedsAttention={lockNeedsAttentionCards}
            showStatusActions={role === 'admin'}
            statusBadgeMode={statusBadgeMode}
            statusLineMode={statusLineMode}
            analysisLabelMode={analysisLabelMode}
            showConflictStatus={showConflictStatus}
            conflictStatusLabel={conflictStatusLabel}
            columnColorClass={
              role === 'admin'
                ? column.title === 'Issues'
                  ? 'border-t-status-done'
                  : column.title === 'Needs attention'
                  ? 'border-t-status-review'
                  : column.title === 'Stored'
                  ? 'border-t-status-progress'
                  : column.title === 'Deleted'
                  ? 'border-t-status-new'
                  : undefined
                : undefined
            }
            adminActions={
              isAdminUser
                ? {
                    onDelete: (card) => {
                      setDeletePrompt({ open: true, card });
                      setDeleteReason('');
                    },
                    onRestore: handleRestoreCard,
                    onRestoreStored: handleAdminStoredRestore,
                    isDeleted: (card) => Boolean(deletedByCard[card.sampleId]),
                    isStored: (card) => Boolean(adminStoredByCard[card.sampleId]),
                    ...(role === 'admin'
                      ? {
                          onResolve: (card: KanbanCard) => handleAdminStoreNotResolved(card),
                          onReturn: (card: KanbanCard) => {
                            setAdminReturnPrompt({ open: true, card });
                            setAdminReturnNote(getLatestReturnNote(card.sampleId));
                          },
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
      <Dialog open={labNeedsPrompt.open} onOpenChange={(open) => setLabNeedsPrompt({ open, cardId: open ? labNeedsPrompt.cardId : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Needs attention</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Provide a reason for sending this sample to Needs attention.</p>
          <Textarea
            autoFocus
            placeholder="Reason"
            value={labNeedsReason}
            onChange={(e) => setLabNeedsReason(e.target.value)}
            className="min-h-[96px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setLabNeedsPrompt({ open: false, cardId: null })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const targetId = labNeedsPrompt.cardId;
                const reason = labNeedsReason.trim();
                if (!targetId || !reason) return;
                pushLabStateUndo(targetId);
                setLabNeedsPrompt({ open: false, cardId: null });
                setLabNeedsAttentionReasons((prev) => ({ ...prev, [targetId]: reason }));
                setIssueReasons((prev) => ({
                  ...prev,
                  [targetId]: [...(prev[targetId] ?? []), reason],
                }));
                setLabStatusOverrides((prev) => ({ ...prev, [targetId]: 'review' }));
                setLabReturnHighlights((prev) => {
                  if (!prev[targetId]) return prev;
                  const next = { ...prev };
                  delete next[targetId];
                  return next;
                });
                if (selectedCard?.id === targetId) {
                  setSelectedCard({
                    ...selectedCard,
                    status: 'review',
                    statusLabel: columnConfigByRole.lab_operator.find((c) => c.id === 'review')?.title ?? selectedCard.statusLabel,
                    issueReason: reason,
                  });
                }
                setLabNeedsReason('');
              }}
              disabled={!labNeedsReason.trim()}
            >
              Send to Needs attention
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
      <Dialog open={adminReturnPrompt.open} onOpenChange={(open) => setAdminReturnPrompt({ open, card: open ? adminReturnPrompt.card : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return for analysis</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">What was done? This note will appear on the admin card.</p>
          <Textarea
            autoFocus
            placeholder="Explanation"
            value={adminReturnNote}
            onChange={(e) => setAdminReturnNote(e.target.value)}
            className="min-h-[96px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAdminReturnPrompt({ open: false, card: null })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const target = adminReturnPrompt.card;
                const note = adminReturnNote.trim();
                if (!target || !note) return;
                setUndoStack((prev) => [
                  ...prev.slice(-19),
                  {
                    kind: 'adminReturn',
                    sampleId: target.sampleId,
                    prevReturnNotes: adminReturnNotes[target.sampleId],
                    prevLabOverride: labStatusOverrides[target.sampleId],
                    prevLabReturnHighlight: labReturnHighlights[target.sampleId],
                    prevWarehouseReturnHighlight: warehouseReturnHighlights[target.sampleId],
                    prevSample: target.status === 'done' ? getSampleSnapshot(target.sampleId) : undefined,
                  },
                ]);
                setAdminReturnNotes((prev) => ({
                  ...prev,
                  [target.sampleId]: [...(prev[target.sampleId] ?? []), note],
                }));
                setAdminReturnPrompt({ open: false, card: null });
                setAdminReturnNote('');
                if (target.status === 'done') {
                  const warehouseStatus =
                    target.storageLocation && target.storageLocation.trim() ? 'review' : 'progress';
                  handleSampleFieldUpdate(target.sampleId, { status: warehouseStatus }, { skipUndo: true });
                  setWarehouseReturnHighlights((prev) => ({ ...prev, [target.sampleId]: true }));
                }
                const methods = plannedAnalyses.filter((pa) => pa.sampleId === target.sampleId);
                const hasDone = methods.some((m) => m.status === 'completed');
                setLabReturnState(target.sampleId, hasDone ? 'progress' : 'new');
                if (selectedCard?.sampleId === target.sampleId) {
                  setSelectedCard({ ...selectedCard, returnNote: note });
                }
              }}
              disabled={!adminReturnNote.trim()}
            >
              Return for analysis
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
