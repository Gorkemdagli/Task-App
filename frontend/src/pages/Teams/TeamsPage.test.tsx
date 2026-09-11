import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Team, TeamDetail } from '@/services/teams';
import { TeamsPage } from './TeamsPage';

const mocks = vi.hoisted(() => ({
  useTeams: vi.fn(),
  useTeam: vi.fn(),
}));

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeams: mocks.useTeams,
  useTeam: mocks.useTeam,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isCompanyAdmin: true }),
}));

vi.mock('./CreateTeamModal', () => ({
  CreateTeamModal: () => <button type="button">Yeni Takım</button>,
}));

const teams: Team[] = [
  {
    id: 'team-1',
    name: 'Product',
    description: 'Ürün ekibi',
    tenantId: 'tenant-1',
    memberCount: 2,
    createdAt: '2024-01-12',
  },
  {
    id: 'team-2',
    name: 'Marketing',
    description: null,
    tenantId: 'tenant-1',
    memberCount: 1,
    createdAt: '2024-02-12',
  },
];

const details: Record<string, TeamDetail> = {
  'team-1': {
    ...teams[0],
    taskCount: 4,
    members: [
      {
        userId: 'user-1',
        displayId: 'DK',
        fullName: 'Deniz Kaya',
        avatarUrl: null,
        role: 'teamAdmin',
        joinedAt: '2024-01-12',
      },
      {
        userId: 'user-2',
        displayId: 'AY',
        fullName: 'Ayşe Yılmaz',
        avatarUrl: null,
        role: 'member',
        joinedAt: '2024-01-12',
      },
    ],
  },
  'team-2': {
    ...teams[1],
    taskCount: 1,
    members: [
      {
        userId: 'user-3',
        displayId: 'MK',
        fullName: 'Mert Kaya',
        avatarUrl: null,
        role: 'member',
        joinedAt: '2024-02-12',
      },
    ],
  },
};

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teams']}>
      <LocationProbe />
      <Routes>
        <Route path="/teams" element={<TeamsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeamsPage directory', () => {
  beforeEach(() => {
    mocks.useTeams.mockReturnValue({ data: teams, isLoading: false, isError: false });
    mocks.useTeam.mockImplementation((id: string | undefined) => ({
      data: id ? details[id] : undefined,
      isLoading: false,
      isError: false,
    }));
  });

  it('selects the first team and previews its detail', () => {
    renderPage();

    expect(screen.getByTestId('team-directory-item-team-1')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('team-preview-team-1')).toHaveTextContent('Product');
    expect(screen.getByText('Deniz Kaya')).toBeInTheDocument();
  });

  it('changes the preview without changing the URL', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('team-directory-item-team-2'));

    expect(screen.getByTestId('team-directory-item-team-2')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('team-mobile-preview-team-2')).toHaveTextContent('Marketing');
    expect(screen.getByTestId('location')).toHaveTextContent('/teams');
  });

  it('opens the clicked team preview inline on mobile', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      screen.queryByRole('button', { name: /seçili takımın önizlemesini aç/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('team-directory-item-team-2'));

    expect(screen.getByTestId('team-directory-item-team-2')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('team-mobile-preview-team-2')).toHaveTextContent('Marketing');
    expect(screen.queryByTestId('team-mobile-preview-team-1')).not.toBeInTheDocument();
  });

  it('closes the mobile preview when the expanded team is clicked again', async () => {
    const user = userEvent.setup();
    renderPage();

    const team = screen.getByTestId('team-directory-item-team-1');
    await user.click(team);
    await user.click(team);

    expect(team).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('team-mobile-preview-team-1')).not.toBeInTheDocument();
  });
});
