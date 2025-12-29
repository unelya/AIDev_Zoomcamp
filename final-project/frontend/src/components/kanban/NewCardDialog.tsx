import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NewCardPayload } from '@/types/kanban';

interface NewCardDialogProps {
  onCreate: (payload: NewCardPayload) => void;
}

export function NewCardDialog({ onCreate }: NewCardDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewCardPayload>({
    sampleId: '',
    wellId: '',
    horizon: '',
    samplingDate: '',
    storageLocation: '',
  });
  const [error, setError] = useState('');

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
    setForm({ sampleId: '', wellId: '', horizon: '', samplingDate: '', storageLocation: '' });
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <Input id="sampleId" value={form.sampleId} onChange={onChange('sampleId')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="wellId">Well ID</Label>
              <Input id="wellId" value={form.wellId} onChange={onChange('wellId')} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="horizon">Horizon</Label>
              <Input id="horizon" value={form.horizon} onChange={onChange('horizon')} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="samplingDate">Sampling Date</Label>
            <Input id="samplingDate" type="date" value={form.samplingDate} onChange={onChange('samplingDate')} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="storageLocation">Storage Location</Label>
            <Input id="storageLocation" value={form.storageLocation} onChange={onChange('storageLocation')} />
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
