import { Calendar, FlaskConical, MapPin, MessageSquare, User } from 'lucide-react';
import { KanbanCard as CardType } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

interface KanbanCardProps {
  card: CardType;
  onClick: () => void;
  onToggleMethod?: (methodId: number, done: boolean) => void;
  readOnlyMethods?: boolean;
  showStatusActions?: boolean;
  adminActions?: {
    onResolve?: () => void;
    onReturn?: () => void;
    onDelete?: () => void;
    onRestore?: () => void;
    isDeleted?: boolean;
  };
}

export function KanbanCard({ card, onClick, onToggleMethod, readOnlyMethods, adminActions, showStatusActions = false }: KanbanCardProps) {
  const METHOD_ORDER = ['SARA', 'IR', 'Mass Spectrometry', 'Viscosity'];
  const methodRank = (name: string) => {
    const idx = METHOD_ORDER.findIndex((m) => m.toLowerCase() === name.toLowerCase());
    return idx >= 0 ? idx : METHOD_ORDER.length + 100 + name.toLowerCase().charCodeAt(0);
  };
  const sortMethods = (methods: NonNullable<CardType['methods']>) =>
    [...methods].sort((a, b) => {
      const ia = methodRank(a.name);
      const ib = methodRank(b.name);
      if (ia === ib) return a.name.localeCompare(b.name);
      return ia - ib;
    });

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('text/plain', card.id);
  };

  const allMethodsDone =
    card.status === 'progress' &&
    (card.allMethodsDone ||
      (card.methods && card.methods.length > 0 && card.methods.every((m) => m.status === 'completed')));
  const hasAdminActions =
    adminActions &&
    (adminActions.onDelete ||
      adminActions.onRestore ||
      adminActions.onResolve ||
      adminActions.onReturn);

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
        <div className="flex items-center gap-2">
          {card.comments && card.comments.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              <span>{card.comments.length}</span>
            </div>
          )}
          <StatusBadge status={card.status} label={card.statusLabel} />
        </div>
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
        {card.deletedReason && card.statusLabel?.toLowerCase().includes('deleted') && (
          <div className="text-[11px] text-destructive leading-snug">
            Reason: {card.deletedReason}
          </div>
        )}
        {card.issueReason && (
          <div className="text-[11px] text-destructive leading-snug">
            Issue: {card.issueReason}
          </div>
        )}
        {card.methods && card.methods.length > 0 && (
          <div className="space-y-1">
            {sortMethods(card.methods).map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 text-[11px] text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={m.status === 'completed'}
                  onCheckedChange={(val) => {
                    if (readOnlyMethods) return;
                    onToggleMethod?.(m.id, Boolean(val));
                  }}
                  disabled={!onToggleMethod || readOnlyMethods}
                  className="h-3.5 w-3.5 rounded border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white data-[state=checked]:disabled:bg-primary data-[state=checked]:disabled:border-primary data-[state=checked]:disabled:text-white disabled:opacity-100 disabled:cursor-not-allowed"
                />
                <span className="truncate flex-1">{m.name}</span>
                {m.status === 'completed' && <span className="text-[10px] text-destructive font-semibold">Done</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {hasAdminActions && (
        <div className="mt-2 flex items-center gap-2">
          <div className="ml-auto flex gap-2">
            <div className="flex gap-2">
              {!adminActions.isDeleted && (
                <>
                  {adminActions.onDelete && (
                    <button
                      className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        adminActions.onDelete?.();
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {showStatusActions && adminActions.onResolve && (
                    <button
                      className="text-[10px] px-2 py-1 rounded bg-emerald-900 text-emerald-100 hover:bg-emerald-800 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        adminActions.onResolve?.();
                      }}
                    >
                      Mark as resolved
                    </button>
                  )}
                  {showStatusActions && adminActions.onReturn && (
                    <button
                      className="text-[10px] px-2 py-1 rounded bg-amber-900 text-amber-100 hover:bg-amber-800 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        adminActions.onReturn?.();
                      }}
                    >
                      Return for analysis
                    </button>
                  )}
                </>
              )}
              {adminActions.isDeleted && (
                <button
                  className="text-[10px] px-2 py-1 rounded bg-emerald-900 text-emerald-100 hover:bg-emerald-800 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    adminActions.onRestore?.();
                  }}
                >
                  Restore
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
