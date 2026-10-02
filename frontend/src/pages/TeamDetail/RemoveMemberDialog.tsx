import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { TeamMember } from '@/services/teams';

interface RemoveMemberDialogProps {
  member: TeamMember | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  loading: boolean;
  error: string | null;
}

export function RemoveMemberDialog({
  member,
  onClose,
  onConfirm,
  loading,
  error,
}: RemoveMemberDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={Boolean(member)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('teams.removeMember.title')}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{member?.fullName}</span>{' '}
            {t('teams.removeMember.descriptionSuffix')}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="md" disabled={loading}>
              {t('teams.removeMember.cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            size="md"
            loading={loading}
            onClick={onConfirm}
          >
            {t('teams.removeMember.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
