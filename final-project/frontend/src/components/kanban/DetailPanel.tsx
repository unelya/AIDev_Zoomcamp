import { X, Calendar, User, MapPin, FlaskConical } from 'lucide-react';
import { KanbanCard, CommentThread, Role } from '@/types/kanban';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarCmp } from '@/components/ui/calendar';
import { format, parseISO, isValid as isValidDate } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Users } from 'lucide-react';

interface DetailPanelProps {
  card: KanbanCard | null;
  isOpen: boolean;
  onClose: () => void;
  role?: Role;
  onPlanAnalysis?: (data: { analysisType: string; assignedTo?: string }) => void;
  onAssignOperator?: (method: string, operator?: string) => void;
  onResolveConflict?: (note?: string) => void;
  onUpdateSample?: (updates: Record<string, string>) => void;
  onUpdateAnalysis?: (updates: { assigned_to?: string }) => void;
  onToggleMethod?: (methodId: number, done: boolean) => void;
  readOnlyMethods?: boolean;
  adminActions?: {
    onResolve: () => void;
    onReturn: () => void;
  };
  availableMethods?: string[];
  operatorOptions?: { id: number; name: string }[];
  comments?: CommentThread[];
  onAddComment?: (sampleId: string, author: string, text: string) => void;
  currentUserName?: string;
}

export function DetailPanel({ card, isOpen, onClose, role = 'lab_operator', onPlanAnalysis, onAssignOperator, onResolveConflict, onUpdateSample, onUpdateAnalysis, onToggleMethod, readOnlyMethods, adminActions, availableMethods = ['SARA', 'IR', 'Mass Spectrometry', 'Viscosity'], operatorOptions = [], comments = [], onAddComment, currentUserName }: DetailPanelProps) {
  if (!card) return null;
  const METHOD_ORDER = ['SARA', 'IR', 'Mass Spectrometry', 'Viscosity'];
  const methodRank = (name: string) => {
    const idx = METHOD_ORDER.findIndex((m) => m.toLowerCase() === name.toLowerCase());
    return idx >= 0 ? idx : METHOD_ORDER.length + 100 + name.toLowerCase().charCodeAt(0);
  };
  const analysisBadge = (() => {
    const normalized = card.analysisStatus?.toLowerCase() ?? 'planned';
    switch (normalized) {
      case 'in_progress':
        return { status: 'progress', label: 'In progress' };
      case 'review':
        return { status: 'review', label: 'Needs attention' };
      case 'completed':
        return { status: 'done', label: 'Completed' };
      case 'failed':
        return { status: 'review', label: 'Failed' };
      default:
        return { status: 'new', label: 'Planned' };
    }
  })();
  const sortMethods = (methods: NonNullable<KanbanCard['methods']>) =>
    [...methods].sort((a, b) => {
      const ia = methodRank(a.name);
      const ib = methodRank(b.name);
      if (ia === ib) return a.name.localeCompare(b.name);
      return ia - ib;
    });
  const [analysisType, setAnalysisType] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignMethod, setAssignMethod] = useState('');
  const [assignOperator, setAssignOperator] = useState('');
  const [resolution, setResolution] = useState('');
  const [planError, setPlanError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState(currentUserName ?? '');
  const isAdmin = Boolean(onPlanAnalysis);

  useEffect(() => {
    if (currentUserName) {
      setCommentAuthor(currentUserName);
    }
  }, [currentUserName]);
  
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
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Sample status:</span>
                {role === 'warehouse_worker' ? (
                  <StatusBadge status={card.status} label={card.statusLabel} />
                ) : (
                  <span className="text-sm text-foreground">{card.statusLabel}</span>
                )}
                {card.issueReason && card.statusLabel?.toLowerCase().includes('issues') && (
                  <span className="text-sm text-destructive">Issue: {card.issueReason}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Analysis status:</span>
                {role === 'lab_operator' ? (
                  <StatusBadge status={analysisBadge.status} label={analysisBadge.label} />
                ) : (
                  <span className="text-sm text-foreground">{analysisBadge.label}</span>
                )}
              </div>
            </div>
            {adminActions && card.status === 'review' && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="bg-emerald-900 text-emerald-100 hover:bg-emerald-800" onClick={() => adminActions.onResolve()}>
                  Mark as resolved
                </Button>
                <Button size="sm" variant="secondary" className="bg-amber-900 text-amber-100 hover:bg-amber-800" onClick={() => adminActions.onReturn()}>
                  Return for analysis
                </Button>
              </div>
            )}
            
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

          {card.methods && card.methods.length > 0 && (
            <div className="space-y-2 mt-4">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Methods</label>
              <div className="space-y-1">
                  {sortMethods(card.methods).map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={m.status === 'completed'}
                        onCheckedChange={(val) => {
                          if (readOnlyMethods) return;
                          onToggleMethod?.(m.id, Boolean(val));
                        }}
                        className="h-4 w-4 rounded border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white data-[state=checked]:disabled:bg-primary data-[state=checked]:disabled:border-primary data-[state=checked]:disabled:text-white disabled:opacity-100 disabled:cursor-not-allowed"
                        disabled={!onToggleMethod || readOnlyMethods}
                      />
                      <span className="flex-1">
                        {m.name}
                        {m.assignedTo ? (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1 ml-1">
                            <Users className="w-3 h-3" />
                            {m.assignedTo}
                          </span>
                        ) : null}
                      </span>
                      {m.status === 'completed' && <span className="text-[10px] text-destructive font-semibold">Done</span>}
                    </label>
                  ))}
                </div>
            </div>
          )}

          {/* Comments */}
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Comments</label>
              {comments.length > 0 && <span className="text-xs text-muted-foreground">{comments.length}</span>}
            </div>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
            {comments.map((c) => (
              <div key={c.id} className="rounded border border-border bg-muted/40 p-2 space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Users className="w-3 h-3" />
                    <span className="font-semibold text-foreground">{c.author}</span>
                    <span>·</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.text}</p>
                </div>
              ))}
            </div>
            {onAddComment && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Comment as <span className="text-foreground font-semibold">{commentAuthor || 'Unknown'}</span></p>
                <Textarea
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const author = (currentUserName || commentAuthor || '').trim();
                    if (!commentText.trim() || !author) return;
                    onAddComment(card.sampleId, author, commentText.trim());
                    setCommentText('');
                  }}
                >
                  Add comment
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer Actions */}
        <div className="p-4 border-t border-border flex flex-col gap-3">
            {onAssignOperator && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Assign operator to method</p>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={assignMethod || undefined} onValueChange={(v) => setAssignMethod(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMethods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={assignOperator || undefined} onValueChange={(v) => setAssignOperator(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Assign to lab operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorOptions.map((op) => (
                        <SelectItem key={op.id} value={op.name}>
                          {op.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {planError && <p className="text-sm text-destructive">{planError}</p>}
                <Button
                  size="sm"
                  onClick={() => {
                    if (!assignMethod) {
                      setPlanError('Method is required');
                      return;
                    }
                    if (!assignOperator) {
                      setPlanError('Select an operator to assign');
                      return;
                    }
                    onAssignOperator?.(assignMethod, assignOperator);
                    setAssignMethod('');
                    setAssignOperator('');
                    setPlanError('');
                  }}
                >
                  Assign operator
                </Button>
              </div>
            )}
            {isAdmin && onPlanAnalysis && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Add analysis (Admin)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="e.g. NMR"
                    value={analysisType}
                    onChange={(e) => setAnalysisType(e.target.value)}
                  />
                  <Select value={assignedTo || undefined} onValueChange={(v) => setAssignedTo(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Assign to (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorOptions.map((op) => (
                        <SelectItem key={op.id} value={op.name}>
                          {op.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {planError && <p className="text-sm text-destructive">{planError}</p>}
                <Button
                  size="sm"
                  onClick={() => {
                    if (!analysisType.trim()) {
                      setPlanError('Analysis type is required');
                      return;
                    }
                    onPlanAnalysis({
                      analysisType: analysisType.trim(),
                      assignedTo: assignedTo === '__unassigned' ? undefined : assignedTo || undefined,
                    });
                    setAnalysisType('');
                    setAssignedTo('');
                    setPlanError('');
                  }}
                >
                  Add analysis
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
      className="h-9 field-muted"
    />
  ) : (
    <p
      className="text-sm text-foreground cursor-text rounded px-1 py-0.5 bg-muted/60 hover:bg-muted/70 transition-colors"
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
          className="justify-start px-2 h-9 w-full text-left font-normal bg-muted/60 hover:bg-muted/70"
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
