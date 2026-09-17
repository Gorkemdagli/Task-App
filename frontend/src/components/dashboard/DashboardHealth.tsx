import type { DashboardHealth as DashboardHealthModel, DashboardHealthInsight } from '@/services/companyDashboard';

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
  INSUFFICIENT_DATA: 'border-border bg-card/40',
};

function displayValue(insight: DashboardHealthInsight, threshold = false): string {
  const value = threshold ? insight.threshold : insight.observedValue;
  if (value === null) return 'Yok';
  return insight.metric === 'completedTaskCount' ? String(value) : `%${value}`;
}

export function DashboardHealth({ health }: { health: DashboardHealthModel }) {
  const scopeLabel = health.scope.teamName ?? 'Şirket';

  return (
    <section
      aria-labelledby="dashboard-health-heading"
      aria-label="Takım sağlığı"
      data-testid="dashboard-health"
      className={`rounded-lg border p-4 md:p-5 ${STATUS_STYLES[health.status]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dashboard-health-heading" className="text-lg font-semibold">
            Takım sağlığı
          </h2>
          <p className="mt-1 text-sm font-medium" aria-label="Sağlık durumu">
            {STATUS_LABELS[health.status]}
          </p>
        </div>
        <p className="text-xs text-secondary-foreground">
          Örneklem: n={health.sampleSize} · Minimum: {health.minimumSampleSize}
        </p>
      </div>
      <p className="mt-3 text-sm text-secondary-foreground">{health.explanation}</p>
      {health.insights.length > 0 ? (
        <ul aria-label="Sağlık sinyalleri" className="mt-4 space-y-3">
          {health.insights.map((insight) => (
            <li key={`${insight.metric}-${insight.threshold}`} className="rounded-md bg-background/50 p-3">
              <p className="text-sm">{insight.message}</p>
              <p className="mt-1 text-xs text-secondary-foreground">
                Metrik: {insight.metric} · Gözlenen: {displayValue(insight)} · Eşik: {displayValue(insight, true)}
              </p>
              <p className="mt-1 text-xs text-secondary-foreground">
                Dönem: {insight.period.start} – {insight.period.end} · Kapsam: {insight.scope.teamName ?? 'Şirket'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-secondary-foreground">
          Dönem: {health.period.start} – {health.period.end} · Kapsam: {scopeLabel}
        </p>
      )}
    </section>
  );
}
