import { Calendar, User } from 'lucide-react';
import { KanbanCard as CardType } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { PriorityIndicator } from './PriorityIndicator';
import { AnalysisProgress } from './AnalysisProgress';
import { cn } from '@/lib/utils';

interface KanbanCardProps {
  card: CardType;
  onClick: () => void;
}

export function KanbanCard({ card, onClick }: KanbanCardProps) {
  const allAnalysesComplete = card.analyses.every(a => a.checked);
  
  return (
    <div
      onClick={onClick}
      className={cn(
        'kanban-card',
        allAnalysesComplete && 'border-success/30 bg-success/5'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <PriorityIndicator priority={card.priority} />
          <span className="text-xs font-mono text-primary">{card.sampleId}</span>
        </div>
        <StatusBadge status={card.status} />
      </div>
      
      <h4 className="font-medium text-sm text-foreground mb-2 leading-tight">
        {card.title}
      </h4>
      
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
        <span className="bg-muted px-1.5 py-0.5 rounded">{card.category}</span>
        <span>{card.type}</span>
      </div>
      
      <div className="flex items-center justify-between mb-3">
        <AnalysisProgress analyses={card.analyses} />
      </div>
      
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>{card.createdAt}</span>
        </div>
        
        {card.assignee && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="w-3 h-3" />
            <span>{card.assignee}</span>
          </div>
        )}
      </div>
      
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {card.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium"
            >
              {tag}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{card.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
