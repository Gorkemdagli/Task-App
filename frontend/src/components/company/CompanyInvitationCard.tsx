import { Button } from '@/components/ui/button';
import type { CompanyInvitationDTO } from '@/services/companyInvitations';

type CompanyInvitationCardProps = {
  invitation: CompanyInvitationDTO;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
  error?: string;
};

function formatExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
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
  const isResponding = isAccepting || isRejecting;

  return (
    <article
      data-testid={`company-invitation-card-${invitation.id}`}
      className="border-l-4 border-primary bg-card px-3 py-3"
    >
      <div className="flex flex-col gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{invitation.companyName}</h4>
          <p className="text-xs text-muted-foreground">{invitation.inviterName} davet etti</p>
          <p className="text-xs text-muted-foreground">
            Son geçerlilik: {formatExpiry(invitation.expiresAt)}
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
            Kabul Et
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onReject(invitation.id)}
            loading={isRejecting}
            disabled={isAccepting}
          >
            Reddet
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-priority-high">
            {error}
          </p>
        )}
        {isResponding && <span className="sr-only">Davet yanıtı gönderiliyor</span>}
      </div>
    </article>
  );
}
