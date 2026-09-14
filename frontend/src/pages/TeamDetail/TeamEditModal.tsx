import { useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/apiError';
import { useUpdateTeam } from '@/hooks/queries/useTeamMutations';

interface TeamEditModalProps {
  teamId: string;
  name: string;
  description: string | null;
}

export function TeamEditModal({ teamId, name: initialName, description: initialDescription }: TeamEditModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [error, setError] = useState<string | null>(null);
  const updateTeam = useUpdateTeam();

  function reset() {
    setName(initialName);
    setDescription(initialDescription ?? '');
    setError(null);
    updateTeam.reset();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Takım adı en az 2 karakter olmalı.');
      return;
    }

    try {
      await updateTeam.mutateAsync({
        teamId,
        name: trimmedName,
        description: description.trim() || null,
      });
      setOpen(false);
      reset();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Takım bilgileri güncellenemedi.'));
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
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Takım Bilgilerini Düzenle
      </Button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Takım Bilgilerini Düzenle</DialogTitle>
            <DialogDescription>Takım adını ve açıklamasını güncelle.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="team-edit-name" className="text-sm font-medium text-foreground">
              Takım adı <span className="text-secondary-foreground">*</span>
            </label>
            <input
              id="team-edit-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              aria-required="true"
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-edit-description" className="text-sm font-medium text-foreground">
              Açıklama
            </label>
            <textarea
              id="team-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              rows={3}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
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
            <Button type="submit" variant="primary" size="md" loading={updateTeam.isPending}>
              Değişiklikleri Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
