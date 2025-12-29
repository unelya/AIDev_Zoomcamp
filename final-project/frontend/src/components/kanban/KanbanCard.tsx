import { Calendar, FlaskConical, MapPin, User } from 'lucide-react';
import { KanbanCard as CardType } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';

interface KanbanCardProps {
  card: CardType;
  onClick: () => void;
}

export function KanbanCard({ card, onClick }: KanbanCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn('kanban-card', 'border-border/60')}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono text-primary">{card.sampleId}</span>
          <p className="text-sm font-semibold text-foreground leading-tight">{card.analysisType}</p>
        </div>
        <StatusBadge status={card.status} label={card.statusLabel} />
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3 h-3 text-primary" />
          <span className="text-foreground font-medium">{card.analysisStatus}</span>
          {card.assignedTo && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{card.assignedTo}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="text-foreground font-medium">{card.storageLocation}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3" />
          <span>Sampling {card.samplingDate}</span>
          <span className="text-foreground font-semibold">Well {card.wellId}</span>
          <span className="text-muted-foreground">Horizon {card.horizon}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground">
          Sample status: {card.sampleStatus}
        </span>
      </div>
    </div>
  );
}
