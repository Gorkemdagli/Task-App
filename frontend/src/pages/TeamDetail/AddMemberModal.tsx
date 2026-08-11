import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAddMember } from '@/hooks/queries/useTeamMutations';

interface AddMemberModalProps {
  teamId: string;
}

export function AddMemberModal({ teamId }: AddMemberModalProps) {
  const [open, setOpen] = useState(false);
  const [displayId, setDisplayId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addMember = useAddMember(teamId);

  function reset() {
    setDisplayId('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = displayId.trim().replace(/^#/, '').replace(/^TF-/i, '').toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(cleaned)) {
      setError('Geçersiz kullanıcı kimliği. 5 karakter (A-Z, 2-9) olmalı.');
      return;
    }
    try {
      await addMember.mutateAsync({ displayId: cleaned });
      reset();
      setOpen(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Üye eklenemedi.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Üye Ekle
      </Button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Üye Ekle</DialogTitle>
            <DialogDescription>
              Eklemek istediğin kullanıcının kimliğini gir. Kullanıcı kendi profilinden
              kopyalayabilir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="display-id" className="text-sm font-medium text-foreground">
              Kullanıcı kimliği <span className="text-secondary-foreground">*</span>
            </label>
            <input
              id="display-id"
              type="text"
              value={displayId}
              onChange={(e) => setDisplayId(e.target.value)}
              autoFocus
              required
              maxLength={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="A3X9K"
            />
            <p className="text-xs text-secondary-foreground">
              Örnek: <span className="font-mono">A3X9K</span> veya görsel haliyle{' '}
              <span className="font-mono">#TF-A3X9K</span>.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">
                İptal
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" loading={addMember.isPending}>
              Ekle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
