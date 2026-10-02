import { BellOff } from 'lucide-react';
import { useTranslation } from '@/i18n';

export function EmptyNotifications() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="empty-notifications"
      className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
    >
      <BellOff className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{t('Henüz bildirim yok')}</p>
      <p className="text-xs text-muted-foreground">
        {t('Yeni görev atamaları ve yorumlar burada görünecek.')}
      </p>
    </div>
  );
}
