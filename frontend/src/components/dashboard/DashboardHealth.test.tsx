import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardHealth as DashboardHealthModel } from '@/services/companyDashboard';
import { DashboardHealth as DashboardHealthPanel } from './DashboardHealth';

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
    expect(screen.getByRole('list', { name: 'Sağlık sinyalleri' })).toHaveTextContent(
      'Gecikme oranı %20',
    );
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
});
