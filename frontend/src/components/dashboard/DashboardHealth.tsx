import type { DashboardHealth as DashboardHealthModel, DashboardHealthInsight } from '@/services/companyDashboard';
import { useTranslation } from '@/i18n';

const STATUS_LABELS: Record<DashboardHealthModel['status'], string> = {
  ON_TRACK: 'Yolunda',
  AT_RISK: 'Risk altında',
  OFF_TRACK: 'Kritik',
  INSUFFICIENT_DATA: 'Yetersiz veri',
};

const STATUS_STYLES: Record<DashboardHealthModel['status'], string> = {
  ON_TRACK: 'border-primary/40 bg-primary/10',
  AT_RISK: 'border-priority-medium/40 bg-priority-medium/10',
  OFF_TRACK: 'border-priority-high/40 bg-priority-high/10',
  INSUFFICIENT_DATA: 'border-border bg-card',
};

function displayValue(insight: DashboardHealthInsight, language: string, threshold = false): string {
  const value = threshold ? insight.threshold : insight.observedValue;
  if (value === null) return language === 'en' ? 'None' : 'Yok';
  if (insight.metric === 'completedTaskCount') return String(value);
  return language === 'en' ? `${value}%` : `%${value}`;
}

const METRIC_LABELS: Record<DashboardHealthInsight['metric'], string> = {
  completedTaskCount: 'Tamamlanan görev',
  overdueRate: 'Geciken görev',
  blockedRate: 'Engel oranı',
  onTimeDeliveryRate: 'Zamanında teslim oranı',
  agingWipOverThirty: '30 günden uzun WIP',
  throughputBalance: 'Akış dengesi',
  backlogChange: 'İş yükü değişimi',
};

function localizeInsight(insight: DashboardHealthInsight, t: (key: string, options?: Record<string, unknown>) => string) {
  const value = insight.observedValue ?? 0;
  switch (insight.metric) {
    case 'completedTaskCount':
      return t('health.insufficientSample', { count: value, minimum: insight.threshold });
    case 'overdueRate':
    case 'blockedRate':
      if (insight.comparison === 'unavailable') {
        return t(insight.metric === 'overdueRate' ? 'health.noDueTasks' : 'health.noTasks');
      }
      return t('health.rateThreshold', {
        label: t(insight.metric === 'overdueRate' ? 'Gecikme oranı' : 'Engel oranı'),
        value,
        status: /; (OFF_TRACK|AT_RISK) eşiği/.exec(insight.message)?.[1] ?? 'AT_RISK',
        threshold: insight.threshold,
      });
    case 'onTimeDeliveryRate':
      return t('health.onTimeBelowPrevious', { current: value, previous: insight.threshold });
    case 'agingWipOverThirty':
      return t('health.agingWip', { count: value });
    case 'throughputBalance':
      return t('health.throughputBalance', { count: value });
    case 'backlogChange':
      return t('health.backlogIncrease', { count: value });
  }
}

function localizeExplanation(
  health: DashboardHealthModel,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (language !== 'en') return health.explanation;
  const messages = health.insights.map((insight) => localizeInsight(insight, t));
  if (health.status === 'INSUFFICIENT_DATA') {
    return `${t('health.unavailablePrefix')} ${messages.join(' ')}`;
  }
  if (health.status === 'ON_TRACK') {
    const rates = /^Gecikme oranı %(.+?) ve engel oranı %(.+?); AT_RISK eşiklerinin altında\./.exec(
      health.explanation,
    );
    if (!rates) return health.explanation;
    const summary = t('health.onTrackExplanation', { overdue: rates[1], blocked: rates[2] });
    return `${summary}${messages.length ? ` ${messages.join(' ')}` : ''}`;
  }
  const status = t(STATUS_LABELS[health.status]);
  return `${t('health.statusPrefix', { status })} ${messages.join(' ')}`;
}

function formatDate(value: string, language: string) {
  if (language !== 'en') return value;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
}

export function DashboardHealth({ health }: { health: DashboardHealthModel }) {
  const { i18n, t } = useTranslation();
  const scopeLabel = health.scope.teamName ?? t('Şirket');

  return (
    <section
      aria-labelledby="dashboard-health-heading"
      aria-label={t('Takım sağlığı')}
      data-testid="dashboard-health"
      className={`rounded-lg border p-4 md:p-5 ${STATUS_STYLES[health.status]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dashboard-health-heading" className="text-lg font-semibold">
            {t('Takım sağlığı')}
          </h2>
          <p className="mt-1 text-sm font-medium" aria-label={t('Sağlık durumu')}>
            {t(STATUS_LABELS[health.status])}
          </p>
        </div>
        <p className="text-xs text-secondary-foreground">
          {t('Örneklem: n={{sampleSize}} · Minimum: {{minimum}}', {
            sampleSize: health.sampleSize,
            minimum: health.minimumSampleSize,
          })}
        </p>
      </div>
        <p className="mt-3 text-sm text-secondary-foreground">
          {localizeExplanation(health, i18n.language, t)}
        </p>
      {health.insights.length > 0 ? (
        <ul aria-label={t('Sağlık sinyalleri')} className="mt-4 grid gap-3 lg:grid-cols-2">
          {health.insights.map((insight) => (
            <li key={`${insight.metric}-${insight.threshold}`} className="rounded-md bg-background/50 p-3">
                <p className="text-sm">{localizeInsight(insight, t)}</p>
              <p className="mt-1 text-xs text-secondary-foreground">
                {t('Metrik: {{metric}} · Gözlenen: {{observed}} · Eşik: {{threshold}}', {
                  metric: i18n.language === 'en' ? t(METRIC_LABELS[insight.metric]) : insight.metric,
                  observed: displayValue(insight, i18n.language),
                  threshold: displayValue(insight, i18n.language, true),
                })}
              </p>
              <p className="mt-1 text-xs text-secondary-foreground">
                {t('Dönem: {{start}} – {{end}} · Kapsam: {{scope}}', {
                  start: formatDate(insight.period.start, i18n.language),
                  end: formatDate(insight.period.end, i18n.language),
                  scope: insight.scope.teamName ?? scopeLabel,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-secondary-foreground">
          {t('Dönem: {{start}} – {{end}} · Kapsam: {{scope}}', {
            start: formatDate(health.period.start, i18n.language),
            end: formatDate(health.period.end, i18n.language),
            scope: scopeLabel,
          })}
        </p>
      )}
    </section>
  );
}
