import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardHealth as DashboardHealthModel } from '@/services/companyDashboard';
import { DashboardHealth as DashboardHealthPanel } from './DashboardHealth';
import i18n from '@/i18n';

const context = {
  period: { range: '30d' as const, start: '2026-07-22', end: '2026-08-21' },
  scope: { teamId: 'team-a', teamName: 'Alpha' },
};

describe('DashboardHealth', () => {
  it('renders status, explanation, and traceable reasons', () => {
    const health: DashboardHealthModel = {
      ...context,
      status: 'AT_RISK',
      sampleSize: 5,
      minimumSampleSize: 5,
      explanation: 'AT_RISK: Gecikme oranı %20.',
      insights: [
        {
          ...context,
          metric: 'overdueRate',
          observedValue: 20,
          threshold: 20,
          comparison: 'at_or_above',
          message: 'Gecikme oranı %20; AT_RISK eşiği olan %20 seviyesinde veya üzerinde.',
        },
      ],
    };

    render(<DashboardHealthPanel health={health} />);

    expect(screen.getByRole('region', { name: 'Takım sağlığı' })).toHaveTextContent('Risk altında');
    expect(screen.getByText(health.explanation)).toBeInTheDocument();
    const insights = screen.getByRole('list', { name: 'Sağlık sinyalleri' });
    expect(insights).toHaveTextContent('Gecikme oranı %20');
    expect(insights).toHaveClass('grid', 'gap-3', 'lg:grid-cols-2');
    expect(screen.getByText(/Metrik: overdueRate.*Eşik: %20/)).toBeInTheDocument();
    expect(screen.getByText(/Dönem: 2026-07-22 – 2026-08-21.*Kapsam: Alpha/)).toBeInTheDocument();
  });

  it('renders insufficient-data state without warning signals', () => {
    render(
        <DashboardHealthPanel
        health={{
          ...context,
          status: 'INSUFFICIENT_DATA',
          sampleSize: 4,
          minimumSampleSize: 5,
          explanation: 'En az 5 tamamlanan görev gerekir.',
          insights: [],
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Takım sağlığı' })).toHaveTextContent('Yetersiz veri');
    expect(screen.getByText('En az 5 tamamlanan görev gerekir.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Sağlık sinyalleri' })).not.toBeInTheDocument();
  });

  it('localizes deterministic health summaries and insights in English', async () => {
    await i18n.changeLanguage('en');
    render(
      <DashboardHealthPanel
        health={{
          ...context,
          status: 'INSUFFICIENT_DATA',
          sampleSize: 1,
          minimumSampleSize: 5,
          explanation:
            'Sağlık durumu üretilemedi: Örneklem yetersiz: 1/5 tamamlanan görev.',
          insights: [
            {
              ...context,
              metric: 'completedTaskCount',
              observedValue: 1,
              threshold: 5,
              comparison: 'below',
              message: 'Örneklem yetersiz: 1/5 tamamlanan görev.',
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Team health' })).toHaveTextContent(
      'Insufficient data',
    );
    expect(screen.getByText('Health status could not be produced: Insufficient sample: 1/5 completed tasks.')).toBeInTheDocument();
    expect(screen.getByText('Insufficient sample: 1/5 completed tasks.')).toBeInTheDocument();
    expect(screen.getByText(/Metric: Completed tasks · Observed: 1 · Threshold: 5/)).toBeInTheDocument();
    await i18n.changeLanguage('tr');
  });
});
