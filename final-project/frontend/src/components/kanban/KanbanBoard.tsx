import { useEffect, useMemo, useState } from 'react';
import { Filter, SlidersHorizontal } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { DetailPanel } from './DetailPanel';
import { getColumnData, getMockCards, columnConfigByRole } from '@/data/mockData';
import { KanbanCard, NewCardPayload, Role } from '@/types/kanban';
import { Button } from '@/components/ui/button';
import { NewCardDialog } from './NewCardDialog';

const STORAGE_KEY = 'labsync-kanban-cards';

const roleCopy: Record<Role, string> = {
  warehouse_worker: 'Warehouse view: samples and storage',
  lab_operator: 'Lab view: planned analyses',
  action_supervision: 'Action supervision view',
  admin: 'Admin view',
};

export function KanbanBoard({ role }: { role: Role }) {
  const [cards, setCards] = useState<KanbanCard[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as KanbanCard[];
      } catch {
        return getMockCards();
      }
    }
    return getMockCards();
  });
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    // keep detail panel in sync with card state
    if (selectedCard) {
      const updated = cards.find((c) => c.id === selectedCard.id);
      if (updated) setSelectedCard(updated);
    }
  }, [cards, selectedCard]);

  const columns = useMemo(() => getColumnData(cards, role), [cards, role]);
  const handleCardClick = (card: KanbanCard) => {
    setSelectedCard(card);
    setIsPanelOpen(true);
  };
  
  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCard(null), 300);
  };

  const handleDropToColumn = (columnId: KanbanCard['status']) => (cardId: string) => {
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
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  };

  const handleCreateCard = (payload: NewCardPayload) => {
    const newLabel = columnConfigByRole[role]?.find((c) => c.id === 'new')?.title ?? 'Planned';
    const newCard: KanbanCard = {
      id: `NEW-${Date.now()}`,
      status: 'new',
      statusLabel: newLabel,
      analysisStatus: 'planned',
      analysisType: 'Ad-hoc',
      assignedTo: 'Unassigned',
      sampleId: payload.sampleId,
      wellId: payload.wellId,
      horizon: payload.horizon,
      samplingDate: payload.samplingDate,
      storageLocation: 'Unassigned',
      sampleStatus: 'received',
    };
    setCards((prev) => [...prev, newCard]);
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
          <Button size="sm" className="gap-2" onClick={handleSave}>
            Save
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
      />
    </div>
  );
}
