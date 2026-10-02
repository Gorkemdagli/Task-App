import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { useCreateTeam } from '@/hooks/queries/useTeamMutations';
import { useTranslation } from '@/i18n';

export function CreateTeamModal() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createTeam = useCreateTeam();

  function reset() {
    setName('');
    setDescription('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Takım adı en az 2 karakter olmalı.');
      return;
    }
    try {
      await createTeam.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      reset();
      setOpen(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Takım oluşturulamadı.'));
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
      <Button onClick={() => setOpen(true)} size="md">
        <Plus className="h-4 w-4" />
        {t('Yeni Takım')}
      </Button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('Yeni Takım')}</DialogTitle>
            <DialogDescription>
              {t('Şirketin içinde yeni bir takım oluştur. Adı 2-60 karakter, açıklama en fazla 300 karakter.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="team-name" className="text-sm font-medium text-foreground">
              {t('Takım adı')} <span className="text-secondary-foreground">*</span>
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder={t('Örn: Tasarım Ekibi')}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-desc" className="text-sm font-medium text-foreground">
              {t('Açıklama')}
            </label>
            <textarea
              id="team-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder={t('Kısa bir açıklama (opsiyonel)')}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {i18n.exists(error, { lng: 'en' }) ? t(error) : error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">
                {t('İptal')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" loading={createTeam.isPending}>
              {t('Oluştur')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
