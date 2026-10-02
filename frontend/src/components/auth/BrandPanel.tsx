import { ListTodo, MessageCircle, Moon, Sun, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import usFlag from '@/assets/flags/us.png';
import trFlag from '@/assets/flags/tr.png';
import { useTheme } from '@/hooks/useTheme';

const features = [
  { key: 'kanban', Icon: ListTodo },
  { key: 'messaging', Icon: MessageCircle },
  { key: 'roles', Icon: Users },
] as const;

const columns = [
  { key: 'todo', bars: ['w-full', 'w-3/4', 'w-1/2'], color: 'bg-status-todo/40' },
  { key: 'doing', bars: ['w-2/3', 'w-full', 'w-1/2'], color: 'bg-primary' },
  { key: 'done', bars: ['w-1/2', 'w-full', 'w-3/4'], color: 'bg-status-done' },
] as const;

/**
 * BrandPanel (FRONTEND.md §4.8, Faz 3 update):
 * - 50/50 split with form panel inside a centered card container (AuthLayout)
 * - Hidden below the desktop breakpoint (mobile shows only the form panel)
 * - Content: logo, tagline, three feature rows and a mini Kanban proof
 *
 * Signature element: the amber left stripe (FRONTEND.md §7) anchors the panel.
 */
export function BrandPanel() {
  const { t } = useTranslation();
  return (
    <aside
      className="hidden flex-col justify-between border-r border-l-4 border-border border-l-primary bg-background p-6 sm:p-8 lg:flex lg:p-10"
      aria-label={t('auth.brand.panel')}
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('auth.brand.footer')}
            </p>
            <h1 className="mt-1 text-4xl font-bold leading-none tracking-tight text-foreground">
              <span aria-hidden="true">
                Task<span className="text-primary">Flow</span>
              </span>
              <span className="sr-only">TaskFlow</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AuthLanguageToggle />
            <AuthThemeToggle />
          </div>
        </div>
        <p className="mt-4 max-w-xs text-lg leading-relaxed text-muted-foreground">
          {t('auth.brand.taglineFirst')}
          <br />
          {t('auth.brand.taglineSecond')}
        </p>

        <ul className="mt-10 space-y-5 text-sm text-foreground">
          {features.map(({ key, Icon }) => (
            <li key={key} className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border text-foreground">
                <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              </span>
              <span>
                <strong className="block font-semibold">{t(`auth.brand.features.${key}.title`)}</strong>
                <span className="mt-1 block text-muted-foreground">{t(`auth.brand.features.${key}.description`)}</span>
              </span>
            </li>
          ))}
        </ul>

        <section className="mt-10" aria-label={t('auth.brand.workflow')}>
          <h2 className="text-base font-semibold text-foreground">{t('auth.brand.workflowTitle')}</h2>
          <div
            className="mt-4 grid grid-cols-3 gap-1"
            role="img"
            aria-label={t('auth.brand.workflowImage')}
          >
            {columns.map(({ key, bars, color }) => (
              <div key={key} className="rounded-md border border-border bg-card p-2">
                <span className="block truncate text-[11px] font-semibold text-foreground">
                  {t(`auth.brand.columns.${key}`)}
                </span>
                <div className="mt-3 space-y-2" aria-hidden="true">
                  {bars.map((width, index) => (
                    <span
                      key={`${key}-${index}`}
                      className={`block h-2 rounded-sm ${index === 1 ? color : 'bg-muted-foreground/30'} ${width}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

    </aside>
  );
}

export function AuthLanguageToggle() {
  const { t } = useTranslation();
  const languageLabel = t(i18n.language === 'tr' ? 'Dili İngilizce yap' : 'Switch language to Turkish');

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(i18n.language === 'tr' ? 'en' : 'tr')}
      aria-label={languageLabel}
      title={languageLabel}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <img
        src={i18n.language === 'tr' ? trFlag : usFlag}
        alt=""
        aria-hidden="true"
        className="h-6 w-6"
      />
    </button>
  );
}

export function AuthThemeToggle() {
  const { t } = useTranslation();
  const { mode, toggleMode } = useTheme();
  const themeLabel = t(mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç');

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={themeLabel}
      title={themeLabel}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {mode === 'dark' ? <Sun aria-hidden="true" className="h-5 w-5" /> : <Moon aria-hidden="true" className="h-5 w-5" />}
    </button>
  );
}
