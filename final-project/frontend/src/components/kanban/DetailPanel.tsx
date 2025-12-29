import { X, Calendar, User, Tag, FileText, Clock, AlertTriangle } from 'lucide-react';
import { KanbanCard } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { AnalysisProgress } from './AnalysisProgress';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface DetailPanelProps {
  card: KanbanCard | null;
  isOpen: boolean;
  onClose: () => void;
}

const priorityLabels = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const priorityColors = {
  low: 'text-muted-foreground',
  medium: 'text-primary',
  high: 'text-warning',
  critical: 'text-destructive',
};

export function DetailPanel({ card, isOpen, onClose }: DetailPanelProps) {
  if (!card) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-background/60 backdrop-blur-sm z-40 transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div
        className={cn(
          'detail-panel',
          isOpen ? 'detail-panel-visible' : 'detail-panel-hidden'
        )}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-border">
            <div>
              <p className="text-xs font-mono text-primary mb-1">{card.sampleId}</p>
              <h2 className="text-lg font-semibold text-foreground">{card.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-md transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
            {/* Status & Priority */}
            <div className="flex items-center gap-3">
              <StatusBadge status={card.status} />
              <div className={cn('flex items-center gap-1 text-sm', priorityColors[card.priority])}>
                <AlertTriangle className="w-4 h-4" />
                <span>{priorityLabels[card.priority]} Priority</span>
              </div>
            </div>
            
            <Separator />
            
            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Category</label>
                <p className="text-sm text-foreground">{card.category}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Type</label>
                <p className="text-sm text-foreground">{card.type}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Created
                </label>
                <p className="text-sm text-foreground">{card.createdAt}</p>
              </div>
              {card.dueDate && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Due Date
                  </label>
                  <p className="text-sm text-foreground">{card.dueDate}</p>
                </div>
              )}
              {card.assignee && (
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <User className="w-3 h-3" /> Assignee
                  </label>
                  <p className="text-sm text-foreground">{card.assignee}</p>
                </div>
              )}
            </div>
            
            <Separator />
            
            {/* Analyses Checklist */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Analyses Checklist
              </h3>
              <AnalysisProgress analyses={card.analyses} compact={false} />
            </div>
            
            <Separator />
            
            {/* Tags */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            <Separator />
            
            {/* Notes Placeholder */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Notes</h3>
              <div className="bg-muted rounded-md p-3 min-h-[100px]">
                <p className="text-sm text-muted-foreground italic">
                  No notes added yet. Click to add notes about this sample.
                </p>
              </div>
            </div>
          </div>
          
          {/* Footer Actions */}
          <div className="p-4 border-t border-border flex gap-2">
            <Button variant="outline" className="flex-1">
              Edit
            </Button>
            <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
              Update Status
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
