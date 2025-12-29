import { X, Calendar, User, MapPin, FlaskConical } from 'lucide-react';
import { KanbanCard } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface DetailPanelProps {
  card: KanbanCard | null;
  isOpen: boolean;
  onClose: () => void;
  onPlanAnalysis?: (data: { analysisType: string; assignedTo?: string }) => void;
}

export function DetailPanel({ card, isOpen, onClose, onPlanAnalysis }: DetailPanelProps) {
  if (!card) return null;
  const [analysisType, setAnalysisType] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  
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
              <h2 className="text-lg font-semibold text-foreground">{card.analysisType}</h2>
              <p className="text-sm text-muted-foreground">Planned analysis</p>
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
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge status={card.status} label={card.statusLabel} />
              <div className="text-sm text-muted-foreground">Analysis status: {card.analysisStatus}</div>
            </div>
            
            <Separator />
            
            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <FlaskConical className="w-3 h-3" /> Analysis Type
                </label>
                <p className="text-sm text-foreground">{card.analysisType}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Assigned To</label>
                <p className="text-sm text-foreground">{card.assignedTo ?? 'Unassigned'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Sampling Date
                </label>
                <p className="text-sm text-foreground">{card.samplingDate}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <User className="w-3 h-3" /> Sample Status
                </label>
                <p className="text-sm text-foreground">{card.sampleStatus}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Storage
                </label>
                <p className="text-sm text-foreground">{card.storageLocation}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Well</label>
                <p className="text-sm text-foreground">Well {card.wellId} · Horizon {card.horizon}</p>
              </div>
            </div>
          </div>
          
          {/* Footer Actions */}
          <div className="p-4 border-t border-border flex flex-col gap-3">
            {onPlanAnalysis && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Plan new analysis for {card.sampleId}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Analysis type (e.g. SARA)" value={analysisType} onChange={(e) => setAnalysisType(e.target.value)} />
                  <Input placeholder="Assigned to (optional)" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!analysisType) return;
                    onPlanAnalysis({ analysisType, assignedTo: assignedTo || undefined });
                    setAnalysisType('');
                    setAssignedTo('');
                  }}
                >
                  Plan analysis
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                Edit
              </Button>
              <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                Update Status
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
