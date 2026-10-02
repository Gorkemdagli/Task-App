import { useTranslation } from '@/i18n';

export function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="route-fallback"
      className="flex min-h-screen items-center justify-center bg-background text-secondary-foreground"
      role="status"
      aria-label={t('Sayfa yükleniyor')}
    >
      {t('Yükleniyor...')}
    </div>
  );
}
