import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NewCardPayload } from '@/types/kanban';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarCmp } from '@/components/ui/calendar';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface NewCardDialogProps {
  onCreate: (payload: NewCardPayload) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewCardDialog({ onCreate, open, onOpenChange }: NewCardDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [form, setForm] = useState<NewCardPayload>({
    sampleId: '',
    wellId: '',
    horizon: '',
    samplingDate: today,
    storageLocation: '',
  });
  const [error, setError] = useState('');
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (!dialogOpen) {
      setForm({ sampleId: '', wellId: '', horizon: '', samplingDate: today, storageLocation: '' });
      setError('');
      setDateOpen(false);
    }
  }, [dialogOpen, today]);

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const onChange = (field: keyof NewCardPayload) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setError('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.sampleId || !form.wellId || !form.horizon || !form.samplingDate) {
      setError('All required fields must be filled');
      return;
    }
    onCreate(form);
    setOpen(false);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New Sample</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new sample</DialogTitle>
          <DialogDescription>Minimal fields for a sample card. Saved locally only.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sampleId">Sample ID</Label>
            <Input id="sampleId" value={form.sampleId} onChange={onChange('sampleId')} required className="field-muted" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="wellId">Well ID</Label>
              <Input id="wellId" value={form.wellId} onChange={onChange('wellId')} required className="field-muted" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="horizon">Horizon</Label>
              <Input id="horizon" value={form.horizon} onChange={onChange('horizon')} required className="field-muted" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="samplingDate">Sampling Date</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal bg-muted/60 hover:bg-muted/70"
                  type="button"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {form.samplingDate || 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <CalendarCmp
                  mode="single"
                  selected={form.samplingDate ? new Date(form.samplingDate) : new Date()}
                  onSelect={(date) => {
                    const next = date ? format(date, 'yyyy-MM-dd') : today;
                    setForm((prev) => ({ ...prev, samplingDate: next }));
                    setDateOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label htmlFor="storageLocation">Storage Location</Label>
            <Input id="storageLocation" value={form.storageLocation} onChange={onChange('storageLocation')} className="field-muted" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
