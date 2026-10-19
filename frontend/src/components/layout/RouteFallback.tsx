import { useTranslation } from '@/i18n';

export function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="route-fallback"
      className="flex min-h-24 items-center justify-center bg-background text-secondary-foreground"
      role="status"
      aria-label={t('Sayfa yükleniyor')}
    >
      <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="sr-only">{t('Yükleniyor...')}</span>
    </div>
  );
}
