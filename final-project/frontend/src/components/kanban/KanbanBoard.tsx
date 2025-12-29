import { useEffect, useMemo, useState } from 'react';
import { Filter, SlidersHorizontal } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { DetailPanel } from './DetailPanel';
import { getColumnData, getMockCards, columnConfigByRole } from '@/data/mockData';
import { KanbanCard, NewCardPayload, PlannedAnalysisCard, Role } from '@/types/kanban';
import { Button } from '@/components/ui/button';
import { NewCardDialog } from './NewCardDialog';
import { createPlannedAnalysis, createSample, fetchPlannedAnalyses, fetchSamples, mapApiAnalysis, updatePlannedAnalysis, updateSampleStatus } from '@/lib/api';

const STORAGE_KEY = 'labsync-kanban-cards';

const roleCopy: Record<Role, string> = {
  warehouse_worker: 'Warehouse view: samples and storage',
  lab_operator: 'Lab view: planned analyses',
  action_supervision: 'Action supervision view',
  admin: 'Admin view',
};

export function KanbanBoard({ role }: { role: Role }) {
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [plannedAnalyses, setPlannedAnalyses] = useState<PlannedAnalysisCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    // keep detail panel in sync with card state
    if (selectedCard) {
      const updated = cards.find((c) => c.id === selectedCard.id);
      if (updated) setSelectedCard(updated);
    }
  }, [cards, selectedCard]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [remoteSamples, remoteAnalyses] = await Promise.all([fetchSamples(), fetchPlannedAnalyses()]);
        setCards(remoteSamples);
        setPlannedAnalyses(remoteAnalyses);
      } catch {
        setCards(getMockCards());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const columns = useMemo(() => {
    if (role === 'lab_operator') {
      const analysisCards: KanbanCard[] = plannedAnalyses.map((pa) => {
        const relatedSample = cards.find((c) => c.sampleId === pa.sampleId);
        return {
          id: pa.id.toString(),
          status: toKanbanStatus(pa.status),
          statusLabel: columnConfigByRole[role]?.find((c) => c.id === toKanbanStatus(pa.status))?.title ?? 'Planned',
          sampleId: pa.sampleId,
          wellId: relatedSample?.wellId ?? '—',
          horizon: relatedSample?.horizon ?? '—',
          samplingDate: relatedSample?.samplingDate ?? '—',
          storageLocation: relatedSample?.storageLocation ?? 'Unassigned',
          analysisType: pa.analysisType,
          assignedTo: pa.assignedTo ?? 'Unassigned',
          analysisStatus: pa.status,
          sampleStatus: relatedSample?.sampleStatus ?? 'received',
        };
      });
      return getColumnData(analysisCards, role);
    }
    return getColumnData(cards, role);
  }, [cards, plannedAnalyses, role]);
  const handleCardClick = (card: KanbanCard) => {
    setSelectedCard(card);
    setIsPanelOpen(true);
  };
  
  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCard(null), 300);
  };

  const handleDropToColumn = (columnId: KanbanCard['status']) => (cardId: string) => {
    const analysis = plannedAnalyses.find((a) => a.id.toString() === cardId);
    if (analysis) {
      setPlannedAnalyses((prev) =>
        prev.map((pa) => (pa.id === analysis.id ? { ...pa, status: toAnalysisStatus(columnId) } : pa)),
      );
      updatePlannedAnalysis(analysis.id, toAnalysisStatus(columnId)).catch(() => {});
      return;
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
    updateSampleStatus(cardId, columnId).catch(() => {});
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const [remoteSamples, remoteAnalyses] = await Promise.all([fetchSamples(), fetchPlannedAnalyses()]);
      setCards(remoteSamples);
      setPlannedAnalyses(remoteAnalyses);
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
      .catch(() => {
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
    } catch {
      // ignore for now
    }
  };

  const totalSamples = columns.reduce((sum, col) => sum + col.cards.length, 0);
  
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
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            View
          </Button>
          <NewCardDialog onCreate={handleCreateCard} />
          <Button size="sm" className="gap-2" onClick={handleSave} disabled={loading}>
            {loading ? "Syncing..." : "Refresh"}
          </Button>
        </div>
      </div>
      
      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((column) => (
            <div key={column.id} className="w-72 flex-shrink-0">
              <KanbanColumn
                column={column}
                onCardClick={handleCardClick}
                onDropCard={handleDropToColumn(column.id)}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Detail Panel */}
      <DetailPanel
        card={selectedCard}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        onPlanAnalysis={role === 'lab_operator' && selectedCard ? handlePlanAnalysis(selectedCard.sampleId) : undefined}
      />
    </div>
  );
}
