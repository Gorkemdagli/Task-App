import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompanyInvitationCard } from './CompanyInvitationCard';

const invitation = {
  id: 'invitation-1',
  tenantId: 'tenant-a',
  companyName: 'Acme',
  inviterName: 'Ada Admin',
  status: 'pending' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
  respondedAt: null,
};

describe('CompanyInvitationCard', () => {
  it('renders company, inviter, expiry, and both actions', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onReject = vi.fn();

    render(
      <CompanyInvitationCard invitation={invitation} onAccept={onAccept} onReject={onReject} />,
    );

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(/Ada Admin/)).toBeInTheDocument();
    expect(screen.getByText(/27\.08\.2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Kabul Et' }));
    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    expect(onAccept).toHaveBeenCalledWith('invitation-1');
    expect(onReject).toHaveBeenCalledWith('invitation-1');
  });

  it('disables actions while responding and shows an error', () => {
    render(
      <CompanyInvitationCard
        invitation={invitation}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        isAccepting
        error="Davet işlemi başarısız oldu."
      />,
    );

    expect(screen.getByRole('button', { name: 'Kabul Et' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Davet işlemi başarısız oldu.');
  });
});
