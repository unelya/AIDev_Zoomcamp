import { X, Calendar, User, MapPin, FlaskConical } from 'lucide-react';
import { KanbanCard } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarCmp } from '@/components/ui/calendar';
import { format, parseISO, isValid as isValidDate } from 'date-fns';

interface DetailPanelProps {
  card: KanbanCard | null;
  isOpen: boolean;
  onClose: () => void;
  onPlanAnalysis?: (data: { analysisType: string; assignedTo?: string }) => void;
  onResolveConflict?: (note?: string) => void;
  onUpdateSample?: (updates: Record<string, string>) => void;
  onUpdateAnalysis?: (updates: { assigned_to?: string }) => void;
  onToggleMethod?: (methodId: number, done: boolean) => void;
}

export function DetailPanel({ card, isOpen, onClose, onPlanAnalysis, onResolveConflict, onUpdateSample, onUpdateAnalysis, onToggleMethod }: DetailPanelProps) {
  if (!card) return null;
  const [analysisType, setAnalysisType] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [resolution, setResolution] = useState('');
  const [planError, setPlanError] = useState('');
  
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
                <EditableField
                  value={card.assignedTo ?? 'Unassigned'}
                  placeholder="Add assignee"
                  onSave={(val) => {
                    if (card.analysisType === 'Sample' && onUpdateSample) {
                      onUpdateSample({ assigned_to: val || 'Unassigned' });
                    }
                    if (card.analysisType !== 'Sample' && onUpdateAnalysis) {
                      onUpdateAnalysis({ assigned_to: val || 'Unassigned' });
                    }
                  }}
                  readOnly={!onUpdateSample && !onUpdateAnalysis}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Sampling Date
                </label>
                <DateEditable
                  value={card.samplingDate}
                  onSave={(val) => onUpdateSample?.({ sampling_date: val })}
                  readOnly={!onUpdateSample}
                />
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
                <EditableField
                  value={card.storageLocation}
                  placeholder="Add location"
                  onSave={(val) => onUpdateSample?.({ storage_location: val || card.storageLocation })}
                  readOnly={!onUpdateSample}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Well</label>
                <div className="flex gap-2">
                  <EditableField
                    value={card.wellId}
                    placeholder="Well"
                    onSave={(val) => onUpdateSample?.({ well_id: val || card.wellId })}
                    readOnly={!onUpdateSample}
                  />
                  <span className="text-sm text-muted-foreground">·</span>
                  <EditableField
                    value={card.horizon}
                    placeholder="Horizon"
                    onSave={(val) => onUpdateSample?.({ horizon: val || card.horizon })}
                    readOnly={!onUpdateSample}
                  />
                </div>
              </div>
              {card.conflictResolutionNote && (
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Resolution note</label>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{card.conflictResolutionNote}</p>
                </div>
              )}
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
                {planError && <p className="text-sm text-destructive">{planError}</p>}
                <Button
                  size="sm"
                  onClick={() => {
                    if (!analysisType) {
                      setPlanError('Analysis type is required');
                      return;
                    }
                    onPlanAnalysis({ analysisType, assignedTo: assignedTo || undefined });
                    setAnalysisType('');
                    setAssignedTo('');
                    setPlanError('');
                  }}
                >
                  Plan analysis
                </Button>
              </div>
            )}
            {onResolveConflict && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Resolve conflict</p>
                <Input placeholder="Resolution note (optional)" value={resolution} onChange={(e) => setResolution(e.target.value)} />
                <Button size="sm" onClick={() => onResolveConflict(resolution || undefined)}>
                  Mark resolved
                </Button>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">OLD</p>
                    <pre className="whitespace-pre-wrap break-words bg-muted/40 rounded p-2 text-[11px]">{card.conflictOld ?? '—'}</pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">NEW</p>
                    <pre className="whitespace-pre-wrap break-words bg-muted/40 rounded p-2 text-[11px]">{card.conflictNew ?? '—'}</pre>
                </div>
              </div>
              {card.methods && card.methods.length > 0 && (
                <div className="space-y-2 col-span-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Methods</label>
                  <div className="space-y-1">
                    {card.methods.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={m.status === 'completed'}
                          onChange={(e) => onToggleMethod?.(m.id, e.target.checked)}
                          className="h-4 w-4 rounded border-border bg-background"
                          disabled={!onToggleMethod}
                        />
                        <span>{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EditableField({
  value,
  placeholder,
  onSave,
  readOnly = false,
}: {
  value: string;
  placeholder?: string;
  onSave?: (val: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    if (readOnly) return;
    setEditing(false);
    if (onSave && draft !== value) {
      onSave(draft.trim());
    }
  };

  return editing && !readOnly ? (
    <Input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
        }
        if (e.key === 'Escape') {
          setEditing(false);
          setDraft(value);
        }
      }}
      className="h-9"
    />
  ) : (
    <p
      className="text-sm text-foreground cursor-text rounded px-1 py-0.5 hover:bg-muted/50 transition-colors"
      onClick={() => {
        if (!readOnly) {
          setEditing(true);
        }
      }}
    >
      {value || <span className="text-muted-foreground">{placeholder ?? 'Add value'}</span>}
    </p>
  );
}

function DateEditable({
  value,
  onSave,
  readOnly = false,
}: {
  value: string;
  onSave?: (val: string) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initialDate = useMemo(() => {
    const parsed = parseISO(value);
    return isValidDate(parsed) ? parsed : new Date();
  }, [value]);
  const [selected, setSelected] = useState<Date>(initialDate);

  const save = (date: Date | undefined) => {
    if (!date || readOnly) return;
    setSelected(date);
    const formatted = format(date, 'yyyy-MM-dd');
    onSave?.(formatted);
    setOpen(false);
  };

  const label = format(selected, 'yyyy-MM-dd');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start px-2 h-9 w-full text-left font-normal hover:bg-muted/50"
          disabled={readOnly}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarCmp
          mode="single"
          selected={selected}
          onSelect={(date) => save(date ?? new Date())}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
