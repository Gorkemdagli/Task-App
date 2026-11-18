import { useTranslation } from '@/i18n';

export function ChatPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <section
        role="status"
        className="rounded-lg border border-border bg-card p-6 text-card-foreground"
      >
        <h1 className="text-2xl font-semibold">{t('Mesajlaşma')}</h1>
        <p className="mt-2 text-sm text-secondary-foreground">
          {t('Mesajlaşma şu anda kullanılamıyor.')}
        </p>
      </section>
    </main>
  );
}
