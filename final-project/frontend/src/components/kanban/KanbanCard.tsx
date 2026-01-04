import { Calendar, FlaskConical, MapPin, User } from 'lucide-react';
import { KanbanCard as CardType } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

interface KanbanCardProps {
  card: CardType;
  onClick: () => void;
  onToggleMethod?: (methodId: number, done: boolean) => void;
}

export function KanbanCard({ card, onClick, onToggleMethod }: KanbanCardProps) {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('text/plain', card.id);
  };

  const allMethodsDone =
    card.status === 'progress' &&
    (card.allMethodsDone ||
      (card.methods && card.methods.length > 0 && card.methods.every((m) => m.status === 'completed')));

  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'kanban-card',
        'border-border/60',
        allMethodsDone ? 'bg-emerald-900/70 border-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]' : ''
      )}
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
        {card.methods && card.methods.length > 0 && (
          <div className="space-y-1">
            {card.methods.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 text-[11px] text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={m.status === 'completed'}
                  onCheckedChange={(val) => onToggleMethod?.(m.id, Boolean(val))}
                  disabled={!onToggleMethod}
                  className="h-3.5 w-3.5 rounded border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white data-[state=checked]:disabled:bg-primary data-[state=checked]:disabled:border-primary data-[state=checked]:disabled:text-white"
                />
                <span className="truncate flex-1">{m.name}</span>
                {m.status === 'completed' && <span className="text-[10px] text-destructive font-semibold">Done</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground">
          Sample status: {card.sampleStatus}
        </span>
      </div>
    </div>
  );
}
