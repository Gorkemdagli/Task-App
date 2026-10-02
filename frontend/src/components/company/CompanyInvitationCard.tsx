import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { CompanyInvitationDTO } from '@/services/companyInvitations';

type CompanyInvitationCardProps = {
  invitation: CompanyInvitationDTO;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
  error?: string;
};

function formatExpiry(expiresAt: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(expiresAt));
}

export function CompanyInvitationCard({
  invitation,
  onAccept,
  onReject,
  isAccepting = false,
  isRejecting = false,
  error,
}: CompanyInvitationCardProps) {
  const { t, i18n } = useTranslation();
  const isResponding = isAccepting || isRejecting;

  return (
    <article
      data-testid={`company-invitation-card-${invitation.id}`}
      className="border-l-4 border-primary bg-card px-3 py-3"
    >
      <div className="flex flex-col gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{invitation.companyName}</h4>
          <p className="text-xs text-muted-foreground">
            {t('company.invitations.invitedBy', { name: invitation.inviterName })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('company.invitations.expires', {
              date: formatExpiry(invitation.expiresAt, i18n.language),
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onAccept(invitation.id)}
            loading={isAccepting}
            disabled={isRejecting}
          >
            {t('company.invitations.accept')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onReject(invitation.id)}
            loading={isRejecting}
            disabled={isAccepting}
          >
            {t('company.invitations.reject')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-priority-high">
            {error}
          </p>
        )}
        {isResponding && <span className="sr-only">{t('company.invitations.responding')}</span>}
      </div>
    </article>
  );
}
